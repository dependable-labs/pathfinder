use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

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
            collateral,
            borrower_shares,
            user_ata_quote,
            vault_ata_quote,
            token_program,
            ..
        } = ctx.accounts;

        let mut shares = args.shares;
        let mut assets = args.amount;

        // Validate that either shares or amount is zero, but not both
        if (shares == 0 && assets == 0) || (shares != 0 && assets != 0) {
            return err!(MarketError::AssetShareValueMismatch);
        }

        msg!("repaying {}", assets);

        accrue_interest(market)?;

        let total_borrows = market.total_borrows()?;

        if assets > 0 {
            shares = to_shares_down(assets, total_borrows, market.total_borrow_shares)?;
        } else {
            assets = to_assets_up(shares, total_borrows, market.total_borrow_shares)?;
        }
        
        // Update market shares
        market.total_borrow_shares = market.total_borrow_shares
                .checked_sub(shares)
                .ok_or(MarketError::MathUnderflow)?;

        // Update user shares
        borrower_shares.borrow_shares = borrower_shares.borrow_shares
                .checked_sub(shares)
                .ok_or(MarketError::MathUnderflow)?;

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
