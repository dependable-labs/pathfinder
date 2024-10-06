use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::math::*;
use crate::{generate_market_seeds, state::*};
use crate::error::MarketError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositCollateralArgs {
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: DepositCollateralArgs)]
pub struct DepositCollateral<'info> {
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
    pub system_program: Program<'info, System>,
}

impl<'info> DepositCollateral<'info> {
    pub fn validate(&self, args: &DepositCollateralArgs) -> Result<()> {
        if args.amount == 0 {
            return err!(MarketError::InvalidDepositCollateralInput);
        }

        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: DepositCollateralArgs) -> Result<()> {
        let DepositCollateral {
            user,
            market,
            user_shares,
            collateral,
            collateral_mint,
            user_ata_collateral,
            vault_ata_collateral,
            token_program,
            associated_token_program,
            system_program,
            ..
        } = ctx.accounts;

        let assets = args.amount;

        // FIXME: Allow users once they removed all collateral to use another collateral mint
        // Set the collateral_mint if it hasn't been set yet
        if user_shares.collateral_mint.is_none() {
            user_shares.collateral_mint = Some(collateral_mint.key());
        }

        // Update market state
        collateral.total_collateral = collateral.total_collateral
            .checked_add(assets)
            .ok_or(error!(MarketError::MathOverflow))?;

        // Update user collateral
        user_shares.collateral_amount = user_shares.collateral_amount
            .checked_add(assets)
            .ok_or(MarketError::MathOverflow)?;

        user_shares.collateral_mint = Some(collateral_mint.key());

        

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