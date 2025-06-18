use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::*};
use pathfinder::{
    math::mul_div_up,
    program::Pathfinder,
    state::{Config, LenderShares, Market, MARKET_SEED_PREFIX, MARKET_SHARES_SEED_PREFIX},
};

use crate::{
    error::*,
    generate_manager_config_seeds,
    state::*,
    traits::{
        path_actions::PathActions,
        vault_accounting::{RemainingAccountsPattern, VaultAccounting},
    },
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawArgs {
    pub assets: u64,
    pub withdraw_queue_index: u8,
}

#[derive(Accounts)]
#[instruction(args: WithdrawArgs)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: recipient is validated in _withdraw_path
    pub recipient: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [
            MANAGER_CONFIG_SEED_PREFIX,
            manager_config.quote_mint.as_ref(),
            manager_config.symbol.as_bytes(),
            manager_config.name.as_bytes(),
        ],
        bump = manager_config.bump,
    )]
    pub manager_config: Account<'info, ManagerVaultConfig>,

    #[account(
        mut,
        seeds = [
            MANAGER_QUEUE_SEED_PREFIX,
            manager_config.key().as_ref(),
        ],
        bump = queue.bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    #[account(
        mut,
        seeds = [
            MANAGER_SHARES_SEED_PREFIX,
            manager_config.key().as_ref(),
            manager_config.fee_recipient.key().as_ref()
        ],
        bump = fee_recipient_shares.bump,
    )]
    pub fee_recipient_shares: Box<Account<'info, SupplyShares>>,

    #[account(
        mut,
        seeds = [
            MANAGER_SHARES_SEED_PREFIX,
            manager_config.key().as_ref(),
            user.key().as_ref()
        ],
        bump,
    )]
    pub user_shares: Box<Account<'info, SupplyShares>>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::authority = recipient,
        associated_token::mint = quote_mint,
    )]
    pub recipient_ata_quote: Account<'info, TokenAccount>,

    // pathfinder accounts
    #[account(
      mut,
      seeds = [
        MARKET_SEED_PREFIX,
        &pathfinder_market.quote_mint.key().as_ref(),
        &pathfinder_market.collateral_mint.key().as_ref(),
        &pathfinder_market.ltv_factor.to_le_bytes(),
        &pathfinder_market.oracle.id.to_bytes(),
      ],
      bump = pathfinder_market.bump,
      seeds::program = pathfinder_program.key(),
    )]
    pub pathfinder_market: Account<'info, Market>,

    #[account(
      mut,
      seeds = [
        MARKET_SHARES_SEED_PREFIX,
        &pathfinder_market.key().as_ref(),
        manager_config.key().as_ref(),
      ],
      bump,
      seeds::program = pathfinder_program.key(),
    )]
    pub lender_shares: Box<Account<'info, LenderShares>>,

    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub pathfinder_config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub vault_ata_quote: Box<Account<'info, TokenAccount>>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub pathfinder_program: Program<'info, Pathfinder>,
    // NOTE: remaining accounts are pathfinder market, lender shares, and manager market config accounts.
    // These are not specified here but are passed in the context
    // the accounts are ordered by supply queue in threes [market, lender_shares, ...]
    // Any excess accounts which exist in the withdraw queue but not in supply queue are tacked onto the end
}

impl<'info, 'c: 'info> VaultAccounting<'info, 'c> for Withdraw<'info> {}
impl<'info, 'c: 'info> PathActions<'info, 'c> for Withdraw<'info> {}
impl<'info, 'c: 'info> Withdraw<'info> {
    pub fn handle(ctx: Context<'_, '_, 'c, 'info, Self>, args: WithdrawArgs) -> Result<()> {
        let Withdraw {
            user,
            recipient,
            manager_config,
            queue,
            fee_recipient_shares,
            user_shares,
            recipient_ata_quote,
            quote_mint,
            pathfinder_market,
            pathfinder_config,
            vault_ata_quote,
            lender_shares,
            associated_token_program,
            system_program,
            token_program,
            pathfinder_program,
            ..
        } = ctx.accounts;

        let (fee_shares, new_total_assets) = Self::_accrued_fee_shares(
            manager_config,
            &queue.withdraw_queue,
            ctx.remaining_accounts,
            pathfinder_config,
            pathfinder_program,
            RemainingAccountsPattern::PairGrouping,
        )?;

        if fee_shares > 0 {
            fee_recipient_shares.shares = fee_recipient_shares
                .shares
                .checked_add(fee_shares)
                .ok_or(ManagerError::MathOverflow)?;
        }

        // Update last total assets
        manager_config.last_total_assets = new_total_assets;

        // check if the assets are greater than the max assets
        let max_assets = Self::max_withdraw(&user_shares, &manager_config)?;

        require!(args.assets <= max_assets, ManagerError::ExceededMaxWithdraw);

        // Update last total assets
        manager_config.last_total_assets = manager_config
            .last_total_assets
            .checked_sub(args.assets)
            .ok_or(ManagerError::MathOverflow)?;

        let shares = Self::_convert_to_shares(
            args.assets,
            manager_config.total_shares,
            manager_config.last_total_assets,
            manager_config.decimals_offset,
            true,
        )?;

        user_shares.shares = user_shares
            .shares
            .checked_sub(shares)
            .ok_or(ManagerError::MathUnderflow)?;

        Self::_withdraw_path(
            args.assets,
            args.withdraw_queue_index,
            &user,
            &recipient,
            &manager_config,
            &queue.withdraw_queue,
            &quote_mint,
            &vault_ata_quote,
            &recipient_ata_quote,
            &pathfinder_market,
            &lender_shares,
            &pathfinder_config,
            &pathfinder_program,
            &token_program,
            &system_program,
            &associated_token_program,
        )?;

        Ok(())
    }
}
