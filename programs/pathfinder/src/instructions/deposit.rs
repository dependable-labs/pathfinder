use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::math::*;
use crate::{state::*, accrue_interest::accrue_interest};
use crate::error::MarketError;


#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositArgs {
    pub amount: u64,
    pub shares: u64,
}

#[derive(Accounts)]
#[instruction(args: DepositArgs)]
pub struct Deposit<'info> {
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

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Deposit<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: DepositArgs) -> Result<()> {
         let Deposit {
            user,
            market,
            user_shares,
            user_ata_quote,
            vault_ata_quote,
            token_program,
            ..
        } = ctx.accounts;

        let mut shares = args.shares;
        let mut assets = args.amount;

        // Validate that either shares or amount is zero, but not both
        if (shares == 0 && assets == 0) || (shares != 0 && assets != 0) {
            return err!(MarketError::InvalidDepositInput);
        }

        accrue_interest(market)?;
        
        if assets > 0 {
            shares = to_shares_down(assets, market.total_quote, market.total_shares)?;
        } else {
            assets = to_assets_up(shares, market.total_quote, market.total_shares)?;
        }
        
        msg!("Depositing {} to vault", assets);

        // Update market shares
        market.total_shares = market.total_shares
                .checked_add(shares)
                .ok_or(MarketError::MathOverflow)?;

        // Update market quote amount
        market.total_quote = market.total_quote
                .checked_add(args.amount)
                .ok_or(MarketError::MathOverflow)?;

        // Update user shares
        user_shares.shares = user_shares.shares
                .checked_add(shares)
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