use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateMarketArgs {
    pub feed_id: String,
    pub ltv_factor: u64,
    pub debt_cap: u64,
} 

#[derive(Accounts)]
#[instruction(args: CreateMarketArgs)]
pub struct CreateMarket<'info> {
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
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<Market>(),
        seeds = [
            MARKET_SEED_PREFIX,
            quote_mint.key().as_ref(),
        ],
        bump,
    )]
    pub market: Box<Account<'info, Market>>,


    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<Collateral>(),
        seeds = [
            MARKET_COLLATERAL_SEED_PREFIX,
            market.key().as_ref(),
            collateral_mint.key().as_ref(),
        ],
        bump,
    )]
    pub collateral: Box<Account<'info, Collateral>>,

    // quote
    #[account(constraint = quote_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::authority = market,
        associated_token::mint = quote_mint
    )]
    pub vault_ata_quote: Box<Account<'info, TokenAccount>>,

    // collateral
    #[account(constraint = collateral_mint.is_initialized == true)]
    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::authority = market,
        associated_token::mint = collateral_mint
    )]
    pub vault_ata_collateral: Box<Account<'info, TokenAccount>>,

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
            authority,
            controller,
            market,
            collateral,
            quote_mint,
            vault_ata_quote: _,
            collateral_mint,
            vault_ata_collateral: _,
            associated_token_program: _,
            token_program: _,
            system_program: _,
        } = ctx.accounts;

        // Get current timestamp from the runtime
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp as u64;

        market.set_inner(Market {
            bump: ctx.bumps.market,

            quote_mint: quote_mint.key(),
            quote_mint_decimals: quote_mint.decimals,

            // lender accounting
            total_shares:0,
            total_quote: 0,
            
            // borrower accounting
            total_borrow_shares: 0,
            total_borrow_assets: 0,
            debt_cap: args.debt_cap,

            // interest
            last_accrual_timestamp: current_timestamp,
            rate_at_target: 0,
        });

        collateral.set_inner(Collateral {
            bump: ctx.bumps.collateral,

            collateral_mint: collateral_mint.key(),
            collateral_mint_decimals: collateral_mint.decimals,

            total_collateral: 0,
            ltv_factor: args.ltv_factor,

            oracle: PythOracle::new(&args.feed_id, 300)?,
        });

        Ok(())
    }
}