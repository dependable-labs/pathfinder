use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::error::MarketError;
use crate::generate_market_seeds;
use crate::math::*;
use crate::oracle::oracle_get_price;
use crate::{accrue_interest::accrue_interest, borrow::is_solvent, state::*};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct LiquidateArgs {
  pub borrower: Pubkey,
  pub collateral_amount: u64,
  pub repay_shares: u64,
}

#[derive(Accounts)]
#[instruction(args: LiquidateArgs)]
pub struct Liquidate<'info> {
  #[account(mut)]
  pub user: Signer<'info>,

  #[account(
    mut,
    seeds = [CONFIG_SEED_PREFIX],
    bump,
  )]
  pub config: Box<Account<'info, Config>>,

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

  #[account(
    mut,
    seeds = [
      BORROWER_SHARES_SEED_PREFIX,
      market.key().as_ref(),
      args.borrower.as_ref()
    ],
    bump
  )]
  pub borrower_shares: Box<Account<'info, BorrowerShares>>,

  #[account(constraint = collateral_mint.key() == market.collateral_mint.key())]
  pub collateral_mint: Box<Account<'info, Mint>>,

  #[account(
    mut,
    associated_token::mint = market.collateral_mint,
    associated_token::authority = market,
  )]
  pub vault_ata_collateral: Box<Account<'info, TokenAccount>>,

  #[account(
    mut,
    associated_token::mint = collateral_mint,
    associated_token::authority = user,
  )]
  pub user_ata_collateral: Box<Account<'info, TokenAccount>>,

  #[account(constraint = quote_mint.key() == market.quote_mint.key())]
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
  /// CHECK: needed for dynamic oracle account
  pub oracle_ai: AccountInfo<'info>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

impl<'info> Liquidate<'info> {
  pub fn validate(&self) -> Result<()> {
    Ok(())
  }

  pub fn handle(ctx: Context<Self>, args: LiquidateArgs) -> Result<()> {
    let Liquidate {
      user,
      config,
      market,
      borrower_shares,
      collateral_mint,
      vault_ata_collateral,
      user_ata_collateral,
      vault_ata_quote,
      user_ata_quote,
      oracle_ai,
      token_program,
      ..
    } = ctx.accounts;

    let mut repay_shares = args.repay_shares;
    let mut collateral_amount = args.collateral_amount;

    // Validate that either shares or amount is zero, but not both
    if (repay_shares == 0 && collateral_amount == 0)
      || (repay_shares != 0 && collateral_amount != 0)
    {
      return err!(MarketError::AssetShareValueMismatch);
    }

    accrue_interest(market, config)?;

    if is_solvent(
      market,
      oracle_ai,
      borrower_shares.borrow_shares,
      borrower_shares.collateral_amount,
      collateral_mint.decimals,
    )? {
      return err!(MarketError::BorrowerIsSolvent);
    }

    let cursor_factor = Decimal::one()
      .try_sub(Decimal::from_raw_u64(LIQUIDATION_CURSOR))?
      .w_mul_down(Decimal::one().try_sub(Decimal::from_raw_u64(market.ltv_factor))?)?;

    // The liquidation incentive factor is min(maxLiquidationIncentiveFactor, 1/(1 - cursor*(1 - lltv))).
    let liquidation_incentive_factor = Decimal::min(
      Decimal::from_raw_u64(MAX_LIQUIDATION_INCENTIVE_FACTOR),
      Decimal::one().w_div_down(cursor_factor)?,
    );

    let colalteral_price = oracle_get_price(&market.oracle, &oracle_ai, true)?;

    let total_borrows = market.total_borrows()?;

    if collateral_amount > 0 {
      let collateral_quoted = mul_div_up(
        collateral_amount as u128,
        colalteral_price.price as u128,
        colalteral_price.scale as u128,
      )?;

      repay_shares = to_shares_up(
        Decimal::from_raw_u64(collateral_quoted).w_div_up(liquidation_incentive_factor)?.to_u64()?,
        total_borrows,
        market.total_borrow_shares,
      )?;
    } else {
      let shares_to_collateral =
        to_assets_down(repay_shares, total_borrows, market.total_borrow_shares)?;

      let collateral_with_incentive = Decimal::from_raw_u64(shares_to_collateral)
      .w_mul_down(liquidation_incentive_factor)?
      .to_u64()?;

      collateral_amount = mul_div_down(
        collateral_with_incentive as u128,
        colalteral_price.scale as u128,
        colalteral_price.price as u128,
      )?;
    }

    let repaid_quote = to_assets_up(repay_shares, total_borrows, market.total_borrow_shares)?;

    // Verify liquidator has sufficient quote tokens
    require_gte!(
      user_ata_quote.amount,
      repaid_quote,
      MarketError::InsufficientBalance
    );

    borrower_shares.borrow_shares = borrower_shares
      .borrow_shares
      .checked_sub(repay_shares)
      .ok_or(MarketError::MathUnderflow)?;

    market.total_borrow_shares = market
      .total_borrow_shares
      .checked_sub(repay_shares)
      .ok_or(MarketError::MathUnderflow)?;

    borrower_shares.collateral_amount = borrower_shares
      .collateral_amount
      .checked_sub(collateral_amount)
      .ok_or(MarketError::MathUnderflow)?;

    if borrower_shares.collateral_amount == 0 {
      let bad_debt_shares = borrower_shares.borrow_shares;
      market.total_borrow_shares = market
        .total_borrow_shares
        .checked_sub(bad_debt_shares)
        .unwrap();
      borrower_shares.borrow_shares = 0;
    }

    //add callback mechansim?

    // transfer tokens to liquidator
    let seeds = generate_market_seeds!(market);
    let signer = &[&seeds[..]];

    transfer(
      CpiContext::new_with_signer(
        token_program.to_account_info(),
        Transfer {
          from: vault_ata_collateral.to_account_info(),
          to: user_ata_collateral.to_account_info(),
          authority: market.to_account_info(),
        },
        signer,
      ),
      collateral_amount,
    )?;

    msg!("Liquidating {} from vault", collateral_amount);

    // Create CpiContext for the transfer
    let cpi_context = CpiContext::new(
      token_program.to_account_info(),
      Transfer {
        from: user_ata_quote.to_account_info(),
        to: vault_ata_quote.to_account_info(),
        authority: user.to_account_info(),
      },
    );

    // transfer tokens to vault
    transfer(cpi_context, repaid_quote)?;

    Ok(())
  }
}
