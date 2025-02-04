use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::{state::*, accrue_interest::accrue_interest, borrow::is_solvent, generate_market_seeds};
use crate::error::MarketError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawCollateralArgs {
    pub amount: u64,
    pub owner: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: WithdrawCollateralArgs)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED_PREFIX],
        bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: needed for associated token constraint
    #[account(mut)]
    pub recipient: AccountInfo<'info>,

    // position delegate
    #[account(
        init_if_needed,
        payer = user,
        constraint = args.owner.key() == user.key() || position_delegate.delegate == user.key() @ MarketError::UnauthorizedDelegate,
        space = 8 + std::mem::size_of::<PositionDelegate>(),
        seeds = [
            DELEGATE_SEED_PREFIX,
            args.owner.key().as_ref(),
        ],
        bump
    )]
    pub position_delegate: Box<Account<'info, PositionDelegate>>,

    // market
    #[account(
        mut,
        seeds = [
            MARKET_SEED_PREFIX,
            quote_mint.key().as_ref(),
            collateral_mint.key().as_ref(),
            &market.ltv_factor.to_le_bytes(),
            &market.oracle.id.to_bytes(),
        ],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    // borrower shares
    #[account(
        mut,
        seeds = [
            BORROWER_SHARES_SEED_PREFIX,
            market.key().as_ref(),
            args.owner.key().as_ref()
        ],
        bump
    )]
    pub borrower_shares: Box<Account<'info, BorrowerShares>>,

    // quote
    #[account(constraint = quote_mint.key() == market.quote_mint.key())]
    pub quote_mint: Box<Account<'info, Mint>>,

    // collateral
    #[account(constraint = collateral_mint.key() == market.collateral_mint.key())]
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
    )]
    pub vault_ata_collateral: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::authority = recipient,
        associated_token::mint = collateral_mint,
    )]
    pub recipient_ata_collateral: Box<Account<'info, TokenAccount>>,

    // system programs
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: needed for dynamic oracle account
    pub oracle_ai: AccountInfo<'info>, // oracle account
    pub system_program: Program<'info, System>,
}

impl<'info> WithdrawCollateral<'info> {
    pub fn validate(&self, args: &WithdrawCollateralArgs) -> Result<()> {
        if args.amount == 0 {
            return err!(MarketError::InvalidWithdrawInput);
        }

        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: WithdrawCollateralArgs) -> Result<()> {
        let WithdrawCollateral {
            config,
            market,
            borrower_shares,
            collateral_mint,
            recipient_ata_collateral,
            vault_ata_collateral,
            token_program,
            oracle_ai,
            ..
        } = ctx.accounts;

        let assets = args.amount;

        accrue_interest(market, &config)?;

        // check if user is solvent after withdrawing collateral
        let updated_collateral_amount = borrower_shares.collateral_amount.checked_sub(assets).unwrap();

        if !is_solvent(
            market,
            &oracle_ai,
            borrower_shares.borrow_shares,
            updated_collateral_amount,
            collateral_mint.decimals
        )? {
            return err!(MarketError::NotSolvent);
        }

        // Update market state
        market.total_collateral = market.total_collateral
            .checked_sub(assets)
            .ok_or(error!(MarketError::MathUnderflow))?;

        // Update user collateral
        borrower_shares.collateral_amount = borrower_shares.collateral_amount
            .checked_sub(assets)
            .ok_or(MarketError::MathUnderflow)?;        

        msg!("Withdrawing {} collateral ", assets);

        // transfer tokens to depositor
        let seeds = generate_market_seeds!(market);
        let signer = &[&seeds[..]];

        // Transfer collateral tokens from user to vault
        transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer {
                    from: vault_ata_collateral.to_account_info(),
                    to: recipient_ata_collateral.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer,
            ),
            assets,
        )?;
        
        Ok(())
    }
}