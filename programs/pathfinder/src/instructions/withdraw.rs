use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::error::MarketError;
use crate::{accrue_interest::accrue_interest, generate_config_seeds, math::*};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawArgs {
    pub amount: u64,
    pub shares: u64,
    pub owner: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: WithdrawArgs)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
      mut,
      seeds = [CONFIG_SEED_PREFIX],
      bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: needed for associated token constraint
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
    pub market: Account<'info, Market>,

    #[account(
      mut,
      constraint = args.owner.key() == user.key() || position_delegate.is_some() @ MarketError::UnauthorizedDelegate,
      seeds = [
        MARKET_SHARES_SEED_PREFIX,
        market.key().as_ref(),
        args.owner.key().as_ref()
      ],
      bump
    )]
    pub lender_shares: Account<'info, LenderShares>,

    #[account(
      mut,
      associated_token::mint = market.quote_mint,
      associated_token::authority = config,
    )]
    pub vault_ata_quote: Account<'info, TokenAccount>,

    #[account(
      init_if_needed,
      payer = user,
      associated_token::authority = recipient,
      associated_token::mint = quote_mint,
    )]
    pub recipient_ata_quote: Account<'info, TokenAccount>,

    #[account(constraint = quote_mint.key() == market.quote_mint.key())]
    pub quote_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Withdraw<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: WithdrawArgs) -> Result<()> {
        let Withdraw {
            config,
            market,
            lender_shares,
            recipient_ata_quote,
            vault_ata_quote,
            token_program,
            ..
        } = ctx.accounts;

        let mut shares = args.shares;
        let mut assets = args.amount;

        process_withdrawal_and_transfer(
            market,
            config,
            &mut shares,
            &mut assets,
            false,
            Some(lender_shares),
            vault_ata_quote,
            recipient_ata_quote,
            token_program,
        )?;

        Ok(())
    }
}

pub fn process_withdrawal_and_transfer<'info>(
    market: &mut Account<'info, Market>,
    config: &Account<'info, Config>,
    shares: &mut u64,
    assets: &mut u64,
    is_fee_recipient: bool,
    lender_shares: Option<&mut Account<'info, LenderShares>>,
    vault_ata_quote: &Account<'info, TokenAccount>,
    recipient_ata_quote: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    // Process withdrawal amounts
    if (*shares == 0 && *assets == 0) || (*shares != 0 && *assets != 0) {
        return err!(MarketError::AssetShareValueMismatch);
    }

    accrue_interest(market, config)?;

    if *assets > 0 {
        *shares = to_shares_up(*assets, market.total_deposits as u64, market.total_shares)?;
    } else {
        *assets = to_assets_down(*shares, market.total_deposits as u64, market.total_shares)?;
    }

    // Update market total shares
    market.total_shares = market
        .total_shares
        .checked_sub(*shares)
        .ok_or(error!(MarketError::MathUnderflow))?;

    if is_fee_recipient {
        market.fee_shares = market
            .fee_shares
            .checked_sub(*shares)
            .ok_or(error!(MarketError::MathOverflow))?;
    } else if let Some(shares_account) = lender_shares {
        // Update user shares
        shares_account.shares = shares_account
            .shares
            .checked_sub(*shares)
            .ok_or(error!(MarketError::MathUnderflow))?;
    }

    // Update market total deposits
    market.total_deposits = market
        .total_deposits
        .checked_sub(*assets as u128)
        .ok_or(error!(MarketError::MathUnderflow))?;

    // Transfer tokens
    let seeds = generate_config_seeds!(config);
    let signer = &[&seeds[..]];

    transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: vault_ata_quote.to_account_info(),
                to: recipient_ata_quote.to_account_info(),
                authority: config.to_account_info(),
            },
            signer,
        ),
        *assets,
    )?;

    Ok(())
}
