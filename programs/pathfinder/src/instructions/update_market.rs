use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateMarketArgs {
    pub ltv_factor: u64,
} 

#[derive(Accounts)]
#[instruction(args: UpdateMarketArgs)]
pub struct UpdateMarket<'info> {
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

    // quote
    #[account(constraint = quote_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::authority = market,
        associated_token::mint = quote_mint
    )]
    pub vault_ata_quote: Box<Account<'info, TokenAccount>>,

    // collateral
    #[account(constraint = collateral_mint.is_initialized == true)]
    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::authority = market,
        associated_token::mint = collateral_mint
    )]
    pub vault_ata_collateral: Box<Account<'info, TokenAccount>>,

    // programs
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> UpdateMarket<'info> {

    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: UpdateMarketArgs) -> Result<()> {
         let UpdateMarket {
            collateral,
            ..
        } = ctx.accounts;

        // Get current timestamp from the runtime
        collateral.ltv_factor = args.ltv_factor;

        Ok(())
    }
}