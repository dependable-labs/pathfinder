use anchor_lang::prelude::*;
use anchor_spl::token::*;

use crate::state::*;
use crate::error::MarketError;
use crate::interest_rate::get_rate;
use crate::math::*;

#[derive(Accounts)]
pub struct AccrueInterest<'info> { 

    #[account(mut)]
    pub user: Signer<'info>,  // Add this    

    #[account(
        mut,
        seeds = [CONFIG_SEED_PREFIX],
        bump,
    )]
    pub config: Box<Account<'info, Config>>,

    // market
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
            config,
            ..
        } = ctx.accounts;

        accrue_interest(
            market,
            config
        )?;

        Ok(())
    }
}

pub fn accrue_interest(
    market: &mut Account<Market>,
    config: &Account<Config>
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

    let total_deposits = market.total_deposits()?;
    let interest = w_mul_down(
        total_deposits,
        interest_factor as u64,
    )?;

    // Calculate fee on interest only
    let fee_amount = if config.fee_factor == 0 {
        0
    } else {
        w_mul_down(interest, config.fee_factor as u64)?
    };

    let fee_shares = to_shares_down(fee_amount as u64, total_deposits, market.total_shares)?;

    // Adjust interest factor for regular depositors (subtract fee portion)
    let depositor_interest_factor = interest_factor
        .checked_sub(
            w_mul_down_u128(
                interest_factor, 
                config.fee_factor as u128)
            ?)
        .ok_or(MarketError::MathUnderflow)?;

    // Update indices first
    market.borrow_index = w_mul_down_u128(
        market.borrow_index,
        interest_factor.checked_add(WAD).unwrap(),
    )?;

    market.deposit_index = w_mul_down_u128(
        market.deposit_index,
        depositor_interest_factor.checked_add(WAD).unwrap(),
    )?;

    // Update fee shares
    market.fee_shares = market.fee_shares
        .checked_add(fee_shares)
        .ok_or(MarketError::MathOverflow)?;

    market.total_shares = market.total_shares
        .checked_add(fee_shares)
        .ok_or(error!(MarketError::MathUnderflow))?; 
  
    market.last_accrual_timestamp = current_timestamp;

    Ok(())

}