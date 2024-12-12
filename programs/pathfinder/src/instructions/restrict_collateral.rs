use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::state::*;

#[derive(Accounts)]
pub struct RestrictCollateral<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut,
        seeds = [CONTROLLER_SEED_PREFIX],
        bump = controller.bump,
        constraint = controller.authority == authority.key()
    )]
    pub controller: Box<Account<'info, Controller>>,

    // market
    #[account(
        mut,
        seeds = [
            MARKET_SEED_PREFIX,
            quote_mint.key().as_ref(),
        ],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [
            MARKET_COLLATERAL_SEED_PREFIX,
            market.key().as_ref(),
            collateral_mint.key().as_ref(),
        ],
        bump = collateral.bump,
    )]
    pub collateral: Box<Account<'info, Collateral>>,

    // Required accounts for validation
    pub quote_mint: Box<Account<'info, Mint>>,
    pub collateral_mint: Box<Account<'info, Mint>>,
}

impl<'info> RestrictCollateral<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>) -> Result<()> {
        let RestrictCollateral {
            collateral,
            ..
        } = ctx.accounts;

        // Update collateral settings
        collateral.last_active_timestamp = Clock::get()?.unix_timestamp as u64;

        Ok(())
    }
}