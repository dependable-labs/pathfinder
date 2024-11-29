use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;
use anchor_spl::token_2022::spl_token_2022::extension::group_member_pointer::instruction::update;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::math::*;
use crate::{state::*, accrue_interest::accrue_interest};
use crate::error::MarketError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RepayArgs {
    pub amount: u64,
    pub shares: u64,
}

#[derive(Accounts)]
#[instruction(args: RepayArgs)]
pub struct Repay<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [
            MARKET_SEED_PREFIX,
            market.quote_mint.as_ref(),
        ],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    // borrower shares
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<BorrowerShares>(),
        seeds = [
            BORROWER_SHARES_SEED_PREFIX,
            collateral.key().as_ref(),
            user.key().as_ref()
        ],
        bump
    )]
    pub borrower_shares: Box<Account<'info, BorrowerShares>>,

    // quote
    #[account(constraint = quote_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = market.quote_mint,
        associated_token::authority = market,
    )]
    pub vault_ata_quote: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = market.quote_mint,
        associated_token::authority = user,
    )]
    pub user_ata_quote: Box<Account<'info, TokenAccount>>,


    // collateral
    #[account(constraint = collateral_mint.is_initialized == true)]
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [
            MARKET_COLLATERAL_SEED_PREFIX,
            market.key().as_ref(),
            collateral_mint.key().as_ref()
        ],
        bump = collateral.bump
    )]
    pub collateral: Box<Account<'info, Collateral>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}

impl<'info> Repay<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: RepayArgs) -> Result<()> {
        let Repay {
            user,
            market,
            borrower_shares,
            quote_mint,
            user_ata_quote,
            vault_ata_quote,
            collateral,
            collateral_mint,
            associated_token_program,
            token_program,
            price_update,
            system_program,
        } = ctx.accounts;

        let mut shares = args.shares;
        let mut assets = args.amount;

        // Validate that either shares or amount is zero, but not both
        if (shares == 0 && assets == 0) || (shares != 0 && assets != 0) {
            return err!(MarketError::InvalidInput);
        }

        msg!("repaying {}", assets);

        accrue_interest(market)?;
        
        if assets > 0 {
            shares = to_shares_up(&assets, &market.total_borrow_assets, &market.total_borrow_shares)?;
        } else {
            assets = to_assets_down(&shares, &market.total_borrow_assets, &market.total_borrow_shares)?;
        }

        // Update market shares
        market.total_borrow_shares = market.total_borrow_shares
                .checked_sub(shares)
                .ok_or(MarketError::MathOverflow)?;

        // Update market quote amount
        market.total_borrow_assets = market.total_borrow_assets
                .checked_sub(assets)
                .ok_or(MarketError::MathOverflow)?;

        // Update user shares
        borrower_shares.borrow_shares = borrower_shares.borrow_shares
                .checked_sub(shares)
                .ok_or(MarketError::MathOverflow)?;

        // Create CpiContext for the transfer
        let cpi_context = CpiContext::new(
            token_program.to_account_info(),
            Transfer {
                from: user_ata_quote.to_account_info(),
                to: vault_ata_quote.to_account_info(),
                authority: user.to_account_info(),
            }
        );
        
        // transfer tokens to vault
        transfer(
            cpi_context,
            assets,
        )?;

        Ok(())
    }
}