use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::math::*;
use crate::{generate_market_seeds, state::*};
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
    pub depositor: Signer<'info>,
    #[account(
        mut,
        seeds = [
            MARKET_SEED_PREFIX,
            market.quote_mint.as_ref(),
            market.collateral_mint.as_ref()
        ],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    // user shares
    #[account(
        init_if_needed,
        payer = depositor,
        space = 8 + std::mem::size_of::<UserShares>(),
        seeds = [
            MARKET_SHARES_SEED_PREFIX,
            market.key().as_ref(),
            depositor.key().as_ref()
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
        associated_token::authority = depositor,
    )]
    pub depositor_ata_quote: Box<Account<'info, TokenAccount>>,

    // collateral
    #[account(constraint = collateral_mint.is_initialized == true)]
    pub collateral_mint: Box<Account<'info, Mint>>,

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
            depositor,
            market,
            user_shares,
            quote_mint,
            depositor_ata_quote,
            collateral_mint,
            vault_ata_quote,
            associated_token_program,
            token_program,
            system_program,
        } = ctx.accounts;

        if args.amount == 0 {
            return err!(MarketError::InvalidDepositAmount);
        }
        
        msg!("Depositing {} to vault", args.amount);

        // Create CpiContext for the transfer
        let cpi_context = CpiContext::new(
            token_program.to_account_info(),
            Transfer {
                from: depositor_ata_quote.to_account_info(),
                to: vault_ata_quote.to_account_info(),
                authority: depositor.to_account_info(),
            }
        );
        
        // transfer tokens to vault
        transfer(
            cpi_context,
            args.amount,
        )?;

        // Preview the number of shares to be minted
        let total_shares = market.total_shares;
        let total_assets = market.total_quote;

        // let shares = market.deposit_preview(total_shares, total_assets, args.amount)?;
        let shares = to_shares_down(&args.amount, &total_assets, &total_shares)?;

        // Update user shares
        user_shares.shares = user_shares.shares
                .checked_add(shares)
                .ok_or(MarketError::MathOverflow)?;

        // Update market shares
        market.total_shares = market.total_shares
                .checked_add(shares)
                .ok_or(MarketError::MathOverflow)?;


        // Update market quote amount
        market.total_quote = market.total_quote
                .checked_add(args.amount)
                .ok_or(MarketError::MathOverflow)?;

        Ok(())

    }
}