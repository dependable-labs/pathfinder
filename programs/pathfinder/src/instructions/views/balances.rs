use crate::error::MarketError;
use crate::interest_rate::get_rate;
use crate::math::*;
use crate::state::*;
use crate::{accrue_interest::accrue_interest, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::*;

#[derive(Accounts)]
pub struct ViewMarket<'info> {
  // config
  #[account(
    seeds = [CONFIG_SEED_PREFIX],
    bump,
  )]
  pub config: Account<'info, Config>,

  // market
  #[account(
      seeds = [
        MARKET_SEED_PREFIX,
        quote_mint.key().as_ref(),
        collateral_mint.key().as_ref(),
        &market.ltv_factor.to_le_bytes(),
        &market.oracle.id.to_bytes(),
      ],
      bump = market.bump,
    )]
  pub market: Account<'info, Market>,

  // quote
  #[account(constraint = quote_mint.key() == market.quote_mint.key())]
  pub quote_mint: Account<'info, Mint>,

  // collateral
  #[account(constraint = collateral_mint.key() == market.collateral_mint.key())]
  pub collateral_mint: Account<'info, Mint>,
}

impl<'info> ViewMarket<'info> {
  /// Returns the expected market balances after having accrued interest.
  /// Returns:
  /// - Expected total supply assets
  /// - Expected total supply shares  
  /// - Expected total borrow assets
  /// - Expected total borrow shares
  pub fn expected_market_balances(ctx: Context<ViewMarket<'info>>) -> Result<(u64, u64, u64, u64)> {
    let ViewMarket { config, market, .. } = ctx.accounts;
    expected_market_balances(&market, &config)
  }

  /// Returns the expected total supply assets after having accrued interest
  pub fn expected_total_supply_assets(ctx: Context<ViewMarket<'info>>) -> Result<u64> {
    let ViewMarket { market, config, .. } = ctx.accounts;
    let (total_supply_assets, _, _, _) = expected_market_balances(&market, &config)?;
    Ok(total_supply_assets)
  }

  /// Returns the expected total borrow assets after having accrued interest
  pub fn expected_total_borrow_assets(ctx: Context<ViewMarket<'info>>) -> Result<u64> {
    let ViewMarket { market, config, .. } = ctx.accounts;
    let (_, _, total_borrow_assets, _) = expected_market_balances(&market, &config)?;
    Ok(total_borrow_assets)
  }

  /// Returns the expected total supply shares after having accrued interest
  pub fn expected_total_shares(ctx: Context<ViewMarket<'info>>) -> Result<u64> {
    let ViewMarket { market, config, .. } = ctx.accounts;
    let (_, total_shares, _, _) = expected_market_balances(&market, &config)?;
    Ok(total_shares)
  }

  /// Returns the expected supply assets balance of a user after having accrued interest
  /// Warning: Wrong for fee_recipient because their supply shares increase is not taken into account
  /// Warning: Withdrawing using expected supply assets can lead to error due to rounding
  pub fn expected_supply_assets(
    ctx: Context<ViewMarket<'info>>,
    user_supply_shares: u64,
  ) -> Result<u64> {
    let ViewMarket { market, config, .. } = ctx.accounts;
    let (total_deposits, total_shares, _, _) = expected_market_balances(&market, &config)?;
    to_assets_down(user_supply_shares, total_deposits, total_shares)
  }

  /// Returns the expected borrow assets balance of a user after having accrued interest
  /// Warning: Expected balance is rounded up, so may be greater than market's expected total borrow assets
  pub fn expected_borrow_assets(
    ctx: Context<ViewMarket<'info>>,
    user_borrow_shares: u64,
  ) -> Result<u64> {
    let ViewMarket { market, config, .. } = ctx.accounts;
    let (_, _, total_borrows, total_borrow_shares) = expected_market_balances(&market, &config)?;
    to_assets_up(user_borrow_shares, total_borrows, total_borrow_shares)
  }
}

pub fn expected_market_balances(
  market: &Account<Market>,
  config: &Account<Config>,
) -> Result<(u64, u64, u64, u64)> {
  // Clone the market account to avoid mutating the original account as this is a view method
  let mut market = market.clone();

  let elapsed = (Clock::get()?.unix_timestamp as u64)
    .checked_sub(market.last_accrual_timestamp)
    .ok_or(MarketError::MathUnderflow)?;

  let total_borrows= market.total_borrows()?;

  // Skip if elapsed == 0 or total borrows == 0
  if elapsed != 0 && market.total_borrow_shares != 0 {
    let (avg_rate, _) = get_rate(&market)?;
    let interest_factor = w_taylor_compounded(avg_rate, elapsed).unwrap();
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
      let fee_amount = w_mul_down(interest, config.fee_factor as u64)?;
      let deposits_sub_fee = market.total_deposits().unwrap().checked_sub(fee_amount).unwrap();
      let fee_shares = to_shares_down(fee_amount as u64, deposits_sub_fee, market.total_shares)?;
      market.total_shares = market
        .total_shares
        .checked_add(fee_shares)
        .ok_or(MarketError::MathOverflow)?;
    }
  }

  Ok((
    market.total_deposits()?,
    market.total_shares,
    market.total_borrows()?,
    market.total_borrow_shares,
  ))
}
