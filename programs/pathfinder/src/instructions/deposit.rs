use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::error::MarketError;
use crate::math::*;
use crate::{accrue_interest::accrue_interest, state::*};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositArgs {
  pub amount: u64,
  pub shares: u64,
  pub owner: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: DepositArgs)]
pub struct Deposit<'info> {
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
    init_if_needed,
    payer = user,
    space = 8 + std::mem::size_of::<LenderShares>(),
    seeds = [
      MARKET_SHARES_SEED_PREFIX,
      market.key().as_ref(),
      args.owner.key().as_ref()
    ],
    bump
  )]
  pub lender_shares: Box<Account<'info, LenderShares>>,

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

  #[account(constraint = collateral_mint.key() == market.collateral_mint.key())]
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
      user,
      config,
      market,
      lender_shares,
      user_ata_quote,
      vault_ata_quote,
      token_program,
      ..
    } = ctx.accounts;

    let mut shares = args.shares;
    let mut assets = args.amount;

    msg!("shares: {}", shares);

    // Validate that either shares or assets must be specified, but not both
    if (shares == 0 && assets == 0) || (shares != 0 && assets != 0) {
      return err!(MarketError::AssetShareValueMismatch);
    }

    msg!("depositing {}", assets);

    accrue_interest(market, config)?;

    let total_deposits = market.total_deposits()?;

    if assets > 0 {
      shares = to_shares_down(assets, total_deposits, market.total_shares)?;
    } else {
      assets = to_assets_up(shares, total_deposits, market.total_shares)?;
    }

    // Update market shares
    market.total_shares = market
      .total_shares
      .checked_add(shares)
      .ok_or(MarketError::MathOverflow)?;

    // Update user shares
    lender_shares.shares = lender_shares
      .shares
      .checked_add(shares)
      .ok_or(MarketError::MathOverflow)?;

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
    transfer(cpi_context, assets)?;

    Ok(())
  }
}
