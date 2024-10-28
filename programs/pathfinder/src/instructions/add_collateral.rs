use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::state::*;
// use crate::state::market::PythOracle;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AddCollateralArgs {
    pub oracle: String,
    pub cap: u64,
    pub rate_factor: u64,
}

#[derive(Accounts)]
#[instruction(args: AddCollateralArgs)]
pub struct AddCollateral<'info> {
    // TODO: only futarchy can perform this action
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED_PREFIX, market.quote_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + std::mem::size_of::<Collateral>(),
        seeds = [
            MARKET_COLLATERAL_SEED_PREFIX,
            market.key().as_ref(),
            collateral_mint.key().as_ref(),
        ],
        bump
    )]
    pub collateral: Box<Account<'info, Collateral>>,
    pub collateral_mint: Box<Account<'info, Mint>>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> AddCollateral<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: AddCollateralArgs) -> Result<()> {
        let AddCollateral {
            authority: _,
            market,
            collateral,
            collateral_mint,
            associated_token_program: _,
            token_program: _,
            system_program: _,
        } = ctx.accounts;

        const MAXIMUM_AGE: u64 = 30;
        // let oracle = PythOracle::new(&args.oracle, MAXIMUM_AGE)?;

        collateral.set_inner(Collateral {
            bump: ctx.bumps.collateral,
            mint: collateral_mint.key(),
            total_collateral: 0,
            total_borrow_shares: 0,
            total_borrow_assets: 0,
            decimals: collateral_mint.decimals,
            cap: args.cap,
            rate_factor: args.rate_factor,
            // oracle,
        });

        Ok(())
    }
}