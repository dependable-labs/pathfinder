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
  let time_elapsed = current_timestamp
    .checked_sub(market.last_accrual_timestamp)
    .ok_or(MarketError::MathUnderflow)?;

  let total_borrows = market.total_borrows()?;

  // Get interest rate from IRM
  let (avg_rate, end_rate_at_target) = get_rate(market)?;
  market.rate_at_target = end_rate_at_target;

  // Calculate interest factor using taylor series
  let interest_factor = w_taylor_compounded(avg_rate, time_elapsed).unwrap();
  let interest = w_mul_down(total_borrows, interest_factor as u64)?;

  // Update indexes with interest
  market.borrow_index = w_mul_down(
    market.borrow_index,
    interest_factor.checked_add(WAD as u64).unwrap(),
  )?;

  market.deposit_index = w_mul_down(
    market.deposit_index,
    interest_factor.checked_add(WAD as u64).unwrap(),
  )?;

  // Handle fee if set
  if config.fee_factor != 0 {
    let fee_amount = w_mul_down(interest, config.fee_factor)?;

    // calculate fee shares using total deposits (prior to applying interest)
    let deposits_sub_fee = market.total_deposits().unwrap().checked_sub(fee_amount).unwrap();
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
