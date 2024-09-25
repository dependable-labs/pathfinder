use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

// use crate::error::MarketError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateMarketArgs {
    // pub oracle: Pubkey,
    // pub irm: Pubkey,
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
    pub market: Account<'info, Market>,
    #[account(
        seeds = [MARKET_AUTHORITY_SEED_PREFIX, market.key().as_ref()], bump
    )]
    market_authority: SystemAccount<'info>,
    #[account(
        init,
        payer = owner,
        seeds = [MARKET_LP_MINT_SEED_PREFIX, market_authority.key().as_ref()],
        bump,
        mint::authority = market_authority,
        mint::freeze_authority = market_authority,
        mint::decimals = 9,
    )]
    pub lp_mint: Box<Account<'info, Mint>>,

    // collateral
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::authority = market_authority,
        associated_token::mint = collateral_mint
    )]
    pub vault_ata_collateral: Box<Account<'info, TokenAccount>>,

    // quote
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::authority = market_authority,
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
            market_authority: _,
            lp_mint,
            collateral_mint,
            vault_ata_collateral: _,
            quote_mint,
            vault_ata_quote: _,
            associated_token_program: _,
            token_program: _,
            system_program: _,
        } = ctx.accounts;

        // let current_slot = Clock::get()?.slot;

        let CreateMarketArgs {
            // oracle,
            // irm,
            lltv,
        } = args;

        market.set_inner(Market {
            bump: ctx.bumps.market,

            lp_mint: lp_mint.key(),
            collateral_mint: collateral_mint.key(),
            quote_mint: quote_mint.key(),

            collateral_mint_decimals: collateral_mint.decimals,
            quote_mint_decimals: quote_mint.decimals,

            collateral_amount: 0,
            quote_amount: 0,

            // irm: irm.key(),
            lltv,
            // oracle: oracle.key(),

            // oracle: Oracle::new(
            //     current_slot,
            //     twap_initial_observation,
            //     twap_max_observation_change_per_update,
            // ),
        });

        Ok(())
    }
}