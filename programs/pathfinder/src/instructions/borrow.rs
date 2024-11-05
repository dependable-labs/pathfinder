use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::math::*;
use crate::{generate_market_seeds, state::*, accrue_interest::accrue_interest};
use crate::error::MarketError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BorrowArgs {
    pub amount: u64,
    pub shares: u64,
}

#[derive(Accounts)]
#[instruction(args: BorrowArgs)]
pub struct Borrow<'info> {
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

    // user shares
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<UserShares>(),
        seeds = [
            MARKET_SHARES_SEED_PREFIX,
            market.key().as_ref(),
            user.key().as_ref()
        ],
        bump
    )]
    pub user_shares: Box<Account<'info, UserShares>>,

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

impl<'info> Borrow<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: BorrowArgs) -> Result<()> {
         let Borrow {
            user,
            market,
            user_shares,
            quote_mint,
            user_ata_quote,
            vault_ata_quote,
            collateral,
            collateral_mint,
            associated_token_program,
            token_program,
            system_program,
        } = ctx.accounts;

        let mut shares = args.shares;
        let mut assets = args.amount;

        // Validate that either shares or amount is zero, but not both
        if (shares == 0 && assets == 0) || (shares != 0 && assets != 0) {
            return err!(MarketError::InvalidBorrowInput);
        }

        accrue_interest(market)?;
        
        if assets > 0 {
            shares = to_shares_up(&assets, &market.total_borrow_assets, &market.total_borrow_shares)?;
        } else {
            assets = to_assets_down(&shares, &market.total_borrow_assets, &market.total_borrow_shares)?;
        }

        msg!("Borrowing {} from vault", assets);

        // Update market shares
        market.total_borrow_shares = market.total_borrow_shares
                .checked_add(shares)
                .ok_or(MarketError::MathOverflow)?;

        // Update market quote amount
        market.total_borrow_assets = market.total_borrow_assets
                .checked_add(assets)
                .ok_or(MarketError::MathOverflow)?;

        if market.total_borrow_assets > market.debt_cap {
            return err!(MarketError::DebtCapExceeded);
        }

        // Update user shares
        user_shares.borrow_shares = user_shares.borrow_shares
                .checked_add(shares)
                .ok_or(MarketError::MathOverflow)?;

        // transfer tokens to borrower
        let seeds = generate_market_seeds!(market);
        let signer = &[&seeds[..]];

        transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer {
                    from: vault_ata_quote.to_account_info(),
                    to: user_ata_quote.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer,
            ),
            assets,
        )?;

        Ok(())
    }

}