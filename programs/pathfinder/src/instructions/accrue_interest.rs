use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::state::*;
use crate::error::MarketError;

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

    pub system_program: Program<'info, System>,
}

impl<'info> AccrueInterest<'info> {
    pub fn validate(&self) -> Result<()> {

        Ok(())
    }

    pub fn handle(ctx: Context<Self>) -> Result<()> {
        let AccrueInterest {
            market,
            system_program,
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

    let interest_rate: u64 = 5 * 10_000_000; // 0.05

    // Calculate interest to accrue
    let interest = calculate_interest(
        market.total_borrow_assets,
        interest_rate,
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
    const QUOTE_DECIMALS: u64 = 1_000_000_000;

    // Convert to u128 for intermediate calculations to prevent overflow
    let interest = (borrow_amount as u128)
        .checked_mul(interest_rate as u128)
        .ok_or(MarketError::MathOverflow)?
        .checked_mul(time_elapsed as u128)
        .ok_or(MarketError::MathOverflow)?
        .checked_div(SECONDS_IN_YEAR as u128)
        .ok_or(MarketError::MathOverflow)?
        .checked_div(QUOTE_DECIMALS as u128)
        .ok_or(MarketError::MathOverflow)?;

    Ok(interest as u64)
}
