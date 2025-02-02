use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::get_feed_id_from_hex;

use crate::state::*;

use crate::math::WAD;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateMarketArgs {
    pub feed_id: String,
    pub ltv_factor: u64,
} 

#[derive(Accounts)]
#[instruction(args: CreateMarketArgs)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED_PREFIX],
        bump,
    )]
    pub config: Box<Account<'info, Config>>,

    // market
    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<Market>(),
        seeds = [
            MARKET_SEED_PREFIX,
            quote_mint.key().as_ref(),
            collateral_mint.key().as_ref(),
            &args.ltv_factor.to_le_bytes(),
            &get_feed_id_from_hex(&args.feed_id)?,
        ],
        bump,
    )]
    pub market: Box<Account<'info, Market>>,

    // quote
    #[account(constraint = quote_mint.is_initialized == true)]
    #[account(
        constraint = quote_mint.is_initialized == true && collateral_mint.key() != quote_mint.key()
    )]
    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::authority = market,
        associated_token::mint = quote_mint
    )]
    pub vault_ata_quote: Box<Account<'info, TokenAccount>>,

    // collateral
    #[account(
        constraint = collateral_mint.is_initialized == true && collateral_mint.key() != quote_mint.key()
    )]
    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::authority = market,
        associated_token::mint = collateral_mint,
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
            market,
            quote_mint,
            vault_ata_quote: _,
            collateral_mint,
            ..
        } = ctx.accounts;

        // Get current timestamp from the runtime
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp as u64;

        // create market if it doesn't exist
        market.set_inner(Market {
            bump: ctx.bumps.market,

            // deposit accounting
            total_shares:0,
            deposit_index: WAD,
            quote_mint: quote_mint.key(),
            quote_mint_decimals: quote_mint.decimals,

            // borrows accounting
            total_borrow_shares: 0,
            borrow_index: WAD,
            total_collateral: 0,
            collateral_mint: collateral_mint.key(),
            collateral_mint_decimals: collateral_mint.decimals,
            ltv_factor: args.ltv_factor,
            oracle: PythOracle::new(&args.feed_id)?,

            // interest
            last_accrual_timestamp: current_timestamp,
            rate_at_target: 0,
            fee_shares: 0,
        });

        Ok(())
    }
}