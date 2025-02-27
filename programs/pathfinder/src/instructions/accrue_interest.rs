use anchor_lang::prelude::*;
use anchor_spl::token::*;

use crate::error::MarketError;
use crate::interest_rate::get_rate;
use crate::math::*;
use crate::state::*;

#[derive(Accounts)]
pub struct AccrueInterest<'info> {
  #[account(mut)]
  pub user: Signer<'info>,

  #[account(
    mut,
    seeds = [CONFIG_SEED_PREFIX],
    bump,
  )]
  pub config: Box<Account<'info, Config>>,

  #[account(
    mut,
    seeds = [
      MARKET_SEED_PREFIX,
      quote_mint.key().as_ref(),
      collateral_mint.key().as_ref(),
      &market.ltv_factor.to_le_bytes(),
      &market.oracle.id.to_bytes(),
    ],
    bump = market.bump,
  )]
  pub market: Box<Account<'info, Market>>,

  #[account(constraint = quote_mint.key() == market.quote_mint.key())]
  pub quote_mint: Box<Account<'info, Mint>>,

  #[account(constraint = collateral_mint.key() == market.collateral_mint.key())]
  pub collateral_mint: Box<Account<'info, Mint>>,
}

impl<'info> AccrueInterest<'info> {
  pub fn validate(&self) -> Result<()> {
    Ok(())
  }

  pub fn handle(ctx: Context<Self>) -> Result<()> {
    let AccrueInterest { market, config, .. } = ctx.accounts;

    accrue_interest(market, config)?;

    Ok(())
  }
}

pub fn accrue_interest(market: &mut Account<Market>, config: &Account<Config>) -> Result<()> {
  let clock = Clock::get()?;
  let current_timestamp = clock.unix_timestamp as u64;

  // Ensure time has passed since last accrual
  if current_timestamp <= market.last_accrual_timestamp {
    return Ok(());
  }

  // Calculate time elapsed since last accrual
  let elapsed = current_timestamp
    .checked_sub(market.last_accrual_timestamp)
    .ok_or(MarketError::MathUnderflow)?;

  let total_borrows = market.total_borrows()?;

  // Get interest rate from IRM
  let (avg_rate, end_rate_at_target) = get_rate(market)?;
  market.rate_at_target = end_rate_at_target.to_u128()?;

  // Calculate interest factor using taylor series
  let interest_factor = w_taylor_compounded(avg_rate, Decimal::from_raw_u64(elapsed))?;
  let interest = Decimal::from_raw_u64(total_borrows).w_mul_down(interest_factor)?.to_u64()?;

  // Update indexes with interest
  market.borrow_index = Decimal::from_raw_u128(market.borrow_index)
      .w_mul_down(interest_factor.try_add(Decimal::one())?)?
      .to_u128()?;

  // Update deposit index with interest
  market.deposit_index = Decimal::from_raw_u128(market.deposit_index)
      .w_mul_down(interest_factor.try_add(Decimal::one())?)?
      .to_u128()?;

  // Handle fee if set
  if config.fee_factor != 0 {
    let fee_amount = Decimal::from_raw_u64(interest).w_mul_down(Decimal::from_raw_u64(config.fee_factor))?.to_u64()?;

    // calculate fee shares using total deposits (prior to applying interest)
    let deposits_sub_fee = market.total_deposits()?.checked_sub(fee_amount).unwrap();
    let fee_shares = to_shares_down(fee_amount, deposits_sub_fee, market.total_shares)?;

    // Update fee shares
    market.fee_shares = market
      .fee_shares
      .checked_add(fee_shares)
      .ok_or(MarketError::MathOverflow)?;

    market.total_shares = market
      .total_shares
      .checked_add(fee_shares)
      .ok_or(MarketError::MathOverflow)?;
  }

  market.last_accrual_timestamp = current_timestamp;

  Ok(())
}
