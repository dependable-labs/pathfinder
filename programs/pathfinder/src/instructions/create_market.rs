use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::state::*;
use crate::state::market::PythOracle;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateMarketArgs {
    pub oracle: String,
    pub lltv: u128,
} 

#[derive(Accounts)]
#[instruction(args: CreateMarketArgs)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    // market
    #[account(
        init,
        payer = owner,
        space = 8 + std::mem::size_of::<Market>(),
        seeds = [
            MARKET_SEED_PREFIX,
            quote_mint.key().as_ref(),
            collateral_mint.key().as_ref()
        ],
        bump
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        init,
        payer = owner,
        seeds = [MARKET_LP_MINT_SEED_PREFIX, market.key().as_ref()],
        bump,
        mint::authority = market,
        mint::decimals = 9,
    )]
    pub lp_mint: Box<Account<'info, Mint>>,

    // collateral
    #[account(constraint = collateral_mint.is_initialized == true)]
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::authority = market,
        associated_token::mint = collateral_mint
    )]
    pub vault_ata_collateral: Box<Account<'info, TokenAccount>>,

    // quote
    #[account(constraint = collateral_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::authority = market,
        associated_token::mint = quote_mint
    )]
    pub vault_ata_quote: Box<Account<'info, TokenAccount>>,

    // programs
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateMarket<'info> {

    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: CreateMarketArgs) -> Result<()> {
         let CreateMarket {
            owner: _,
            market,
            lp_mint,
            collateral_mint,
            vault_ata_collateral: _,
            quote_mint,
            vault_ata_quote: _,
            associated_token_program: _,
            token_program: _,
            system_program: _,
        } = ctx.accounts;

        const MAXIMUM_AGE: u64 = 30;
        let oracle = PythOracle::new(&args.oracle, MAXIMUM_AGE)?;

        market.set_inner(Market {
            bump: ctx.bumps.market,

            lp_mint: lp_mint.key(),

            collateral_amount: 0,
            collateral_mint: collateral_mint.key(),
            collateral_mint_decimals: collateral_mint.decimals,

            quote_amount: 0,
            quote_mint: quote_mint.key(),
            quote_mint_decimals: quote_mint.decimals,

            lltv: args.lltv,
            oracle: oracle,
        });

        Ok(())
    }
}