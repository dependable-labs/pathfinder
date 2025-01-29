use anchor_lang::prelude::*;
use anchor_spl::token::*;

use crate::state::*;
use crate::error::MarketError;
use crate::interest_rate::get_rate;
use crate::math::*;

#[derive(Accounts)]
pub struct AccrueInterest<'info> { 
    // market
    #[account(
        mut,
        seeds = [
            MARKET_SEED_PREFIX,
            quote_mint.key().as_ref(),
            collateral_mint.key().as_ref(),
            &market.ltv_factor.to_le_bytes(),
            &market.oracle.feed_id,
        ],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    // quote
    #[account(constraint = quote_mint.key() == market.quote_mint.key())]
    pub quote_mint: Box<Account<'info, Mint>>,

    // collateral
    #[account(constraint = collateral_mint.key() == market.collateral_mint.key())]
    pub collateral_mint: Box<Account<'info, Mint>>,
}

impl<'info> AccrueInterest<'info> {
    pub fn validate(&self) -> Result<()> {

        Ok(())
    }

    pub fn handle(ctx: Context<Self>) -> Result<()> {
        let AccrueInterest {
            market,
            ..
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
        .ok_or(MarketError::MathUnderflow)?;

    // Get interest rate from IRM
    let (avg_rate, end_rate_at_target) = get_rate(market)?;
    market.rate_at_target = end_rate_at_target;

    // Calculate interest factor using taylor series
    let interest_factor = w_taylor_compounded(avg_rate as u128, time_elapsed as u128).unwrap();

    msg!("Interest factor: {}", interest_factor);

    // Update the borrow index by multiplying it with the interest factor
    market.deposit_index = w_mul_down_u128(
        market.deposit_index,
        interest_factor,
    )?;

    market.borrow_index = w_mul_down_u128(
        market.borrow_index,
        interest_factor,
    )?;
 
    market.last_accrual_timestamp = current_timestamp;

    Ok(())

}