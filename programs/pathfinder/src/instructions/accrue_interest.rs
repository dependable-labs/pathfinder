use anchor_lang::prelude::*;

use crate::state::*;
use crate::error::MarketError;
use crate::interest_rate::get_rate;
use crate::math::*;

#[derive(Accounts)]
pub struct AccrueInterest<'info> { 
    #[account(
        mut,
        seeds = [
            MARKET_SEED_PREFIX,
            market.quote_mint.as_ref(),
        ],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}

impl<'info> AccrueInterest<'info> {
    pub fn validate(&self) -> Result<()> {

        Ok(())
    }

    pub fn handle(ctx: Context<Self>) -> Result<()> {
        let AccrueInterest {
            market,
        } = ctx.accounts;

        accrue_interest(
            market,
        )?;

        Ok(())
    }
}

pub fn accrue_interest(
    market: &mut Account<Market>,
) -> Result<()> {

    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp as u64;

    // Ensure time has passed since last accrual
    if current_timestamp <= market.last_accrual_timestamp {
        return Ok(());
    }

    // Calculate time elapsed since last accrual
    let time_elapsed = current_timestamp
        .checked_sub(market.last_accrual_timestamp)
        .ok_or(MarketError::MathOverflow)?;

    // Get interest rate from IRM
    let (avg_rate, end_rate_at_target) = get_rate(market)?;
    market.rate_at_target = end_rate_at_target;

    // Calculate interest to accrue
    let interest = calculate_interest(
        market.total_borrow_assets,
        w_taylor_compounded(avg_rate as u128, time_elapsed as u128).unwrap() as u64,
        time_elapsed,
    )?;

    // Update market state
    market.total_borrow_assets = market.total_borrow_assets
        .checked_add(interest)
        .ok_or(MarketError::MathOverflow)?;

    market.total_quote = market.total_quote
        .checked_add(interest)
        .ok_or(MarketError::MathOverflow)?;
    
    market.last_accrual_timestamp = current_timestamp;

    msg!("Accrued {} interest", interest);

    Ok(())

}

// Helper function to calculate interest
fn calculate_interest(
    borrow_amount: u64,
    interest_rate: u64,
    time_elapsed: u64,
) -> Result<u64> {

    const SECONDS_IN_YEAR: u64 = 31_536_000;

    // TODO: Make this dynamic
    const INTEREST_RATE_DECIMALS: u64 = 1e18 as u64;

    // Convert to u128 for intermediate calculations to prevent overflow
    let interest = (borrow_amount as u128)
        .checked_mul(interest_rate as u128)
        .ok_or(MarketError::MathOverflow)?
        .checked_mul(time_elapsed as u128)
        .ok_or(MarketError::MathOverflow)?
        .checked_div(SECONDS_IN_YEAR as u128)
        .ok_or(MarketError::MathOverflow)?
        .checked_div(INTEREST_RATE_DECIMALS as u128)
        .ok_or(MarketError::MathOverflow)?;

    Ok(interest as u64)
}
