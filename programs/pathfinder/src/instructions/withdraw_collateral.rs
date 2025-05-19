use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::error::MarketError;
use crate::{
  accrue_interest::accrue_interest, borrow::is_solvent, generate_config_seeds, state::*,
};

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
    bump = config.bump,
  )]
  pub config: Box<Account<'info, Config>>,

  /// CHECK: needed for associated token constraint
  #[account(mut)]
  pub recipient: AccountInfo<'info>,

  #[account(
    mut,
    constraint = position_delegate.delegate == user.key() @ MarketError::UnauthorizedDelegate,
    seeds = [
      DELEGATE_SEED_PREFIX,
      args.owner.key().as_ref(),
    ],
    bump = position_delegate.bump
  )]
  pub position_delegate: Option<Box<Account<'info, PositionDelegate>>>,

  #[account(
    mut,
    seeds = [
      MARKET_SEED_PREFIX,
      &market.quote_mint.key().as_ref(),
      &market.collateral_mint.key().as_ref(),
      &market.ltv_factor.to_le_bytes(),
      &market.oracle.id.to_bytes(),
    ],
    bump = market.bump,
  )]
  pub market: Box<Account<'info, Market>>,

  #[account(
    mut,
    constraint = args.owner.key() == user.key() || position_delegate.is_some() @ MarketError::UnauthorizedDelegate,
    seeds = [
      BORROWER_SHARES_SEED_PREFIX,
      market.key().as_ref(),
      args.owner.key().as_ref()
    ],
    bump
  )]
  pub borrower_shares: Box<Account<'info, BorrowerShares>>,

  #[account(
    mut,
    associated_token::mint = market.collateral_mint,
    associated_token::authority = config,
  )]
  pub vault_ata_collateral: Box<Account<'info, TokenAccount>>,

  #[account(
    init_if_needed,
    payer = user,
    associated_token::authority = recipient,
    associated_token::mint = collateral_mint,
  )]
  pub recipient_ata_collateral: Box<Account<'info, TokenAccount>>,

  #[account(constraint = collateral_mint.key() == market.collateral_mint.key())]
  pub collateral_mint: Box<Account<'info, Mint>>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  /// CHECK: needed for dynamic oracle account
  pub oracle_ai: AccountInfo<'info>,
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
      recipient_ata_collateral,
      vault_ata_collateral,
      token_program,
      oracle_ai,
      ..
    } = ctx.accounts;

    let assets = args.amount;

    accrue_interest(market, &config)?;

    // check if user is solvent after withdrawing collateral
    let updated_collateral_amount = borrower_shares
      .collateral_amount
      .checked_sub(assets)
      .unwrap();

    if !is_solvent(
      market,
      &oracle_ai,
      borrower_shares.borrow_shares,
      updated_collateral_amount,
      market.collateral_mint_decimals,
    )? {
      return err!(MarketError::NotSolvent);
    }

    // Update market state
    market.total_collateral = market
      .total_collateral
      .checked_sub(assets)
      .ok_or(error!(MarketError::MathUnderflow))?;

    // Update user collateral
    borrower_shares.collateral_amount = borrower_shares
      .collateral_amount
      .checked_sub(assets)
      .ok_or(MarketError::MathUnderflow)?;

    msg!("Withdrawing {} collateral ", assets);

    // transfer tokens to depositor
    let seeds = generate_config_seeds!(config);
    let signer = &[&seeds[..]];

    // Transfer collateral tokens from user to vault
    transfer(
      CpiContext::new_with_signer(
        token_program.to_account_info(),
        Transfer {
          from: vault_ata_collateral.to_account_info(),
          to: recipient_ata_collateral.to_account_info(),
          authority: config.to_account_info(),
        },
        signer,
      ),
      assets,
    )?;

    Ok(())
  }
}