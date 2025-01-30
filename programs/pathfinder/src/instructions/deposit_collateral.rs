use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::{state::*, accrue_interest::accrue_interest};
use crate::error::MarketError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositCollateralArgs {
    pub amount: u64,
    pub owner: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: DepositCollateralArgs)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    // market
    #[account(
        mut,
        seeds = [
            MARKET_SEED_PREFIX,
            quote_mint.key().as_ref(),
            collateral_mint.key().as_ref(),
            &market.ltv_factor.to_le_bytes(),
            &market.oracle.feed_id,
        ],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    // borrower shares
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<BorrowerShares>(),
        seeds = [
            BORROWER_SHARES_SEED_PREFIX,
            market.key().as_ref(),
            args.owner.key().as_ref()
        ],
        bump
    )]
    pub borrower_shares: Box<Account<'info, BorrowerShares>>,

    #[account(constraint = quote_mint.key() == market.quote_mint.key())]
    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(constraint = collateral_mint.key() == market.collateral_mint.key())]
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
    pub system_program: Program<'info, System>,
}

impl<'info> DepositCollateral<'info> {
    pub fn validate(&self, args: &DepositCollateralArgs) -> Result<()> {
        require!(
            args.amount != 0,
            MarketError::InvalidDepositCollateralInput
        );
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: DepositCollateralArgs) -> Result<()> {
        let DepositCollateral {
            user,
            market,
            borrower_shares,
            user_ata_collateral,
            vault_ata_collateral,
            token_program,
            ..
        } = ctx.accounts;

        let assets = args.amount;

        accrue_interest(market)?;

        // Update market state
        market.total_collateral = market.total_collateral
            .checked_add(assets)
            .ok_or(error!(MarketError::MathOverflow))?;

        // Update user collateral
        borrower_shares.collateral_amount = borrower_shares.collateral_amount
            .checked_add(assets)
            .ok_or(error!(MarketError::MathOverflow))?;        

        msg!("Depositing {} collateral to the vault", assets);

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