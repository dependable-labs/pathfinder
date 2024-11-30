use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::{state::*, accrue_interest::accrue_interest, borrow::is_solvent};
use crate::error::MarketError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawCollateralArgs {
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: WithdrawCollateralArgs)]
pub struct WithdrawCollateral<'info> {
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

    // collateral
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

    #[account(constraint = collateral_mint.is_initialized == true)]
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
    )]
    pub vault_ata_collateral: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = user,
    )]
    pub user_ata_collateral: Box<Account<'info, TokenAccount>>,

    // system programs
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}

impl<'info> WithdrawCollateral<'info> {
    pub fn validate(&self, args: &WithdrawCollateralArgs) -> Result<()> {
        if args.amount == 0 {
            return err!(MarketError::InvalidDepositCollateralInput);
        }

        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: WithdrawCollateralArgs) -> Result<()> {
        let WithdrawCollateral {
            user,
            market,
            borrower_shares,
            collateral,
            collateral_mint,
            user_ata_collateral,
            vault_ata_collateral,
            token_program,
            associated_token_program,
            system_program,
            price_update,
            ..
        } = ctx.accounts;

        let assets = args.amount;

        accrue_interest(market)?;

        // check if user is solvent after withdrawing collateral
        let updated_collateral_amount = borrower_shares.collateral_amount.checked_sub(assets).unwrap();

        if !is_solvent(
            market,
            collateral,
            price_update,
            borrower_shares.borrow_shares,
            updated_collateral_amount,
            collateral_mint.decimals
        )? {
            return err!(MarketError::NotSolvent);
        }

        // Update market state
        collateral.total_collateral = collateral.total_collateral
            .checked_sub(assets)
            .ok_or(error!(MarketError::MathOverflow))?;

        // Update user collateral
        borrower_shares.collateral_amount = borrower_shares.collateral_amount
            .checked_sub(assets)
            .ok_or(MarketError::MathOverflow)?;        

        msg!("Withdrawing {} collateral ", assets);

        // Transfer collateral tokens from user to vault
        transfer(
            CpiContext::new(
                token_program.to_account_info(),
                Transfer {
                    from: user_ata_collateral.to_account_info(),
                    to: vault_ata_collateral.to_account_info(),
                    authority: user.to_account_info(),
                },
            ),
            assets,
        )?;
        
        Ok(())
    }
}