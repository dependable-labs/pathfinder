use anchor_lang::prelude::*;
use anchor_spl::token::*;
use pathfinder::{program::Pathfinder, state::Config};

use crate::{
    error::*,
    state::*,
    traits::{
        path_actions::PathActions,
        vault_accounting::{RemainingAccountsPattern, VaultAccounting},
    },
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositArgs {
    pub assets: u64,
    pub receiver: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: DepositArgs)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [
            MANAGER_CONFIG_SEED_PREFIX,
            config.quote_mint.as_ref(),
            config.symbol.as_bytes(),
            config.name.as_bytes(),
        ],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ManagerVaultConfig>>,

    #[account(
        mut,
        seeds = [
            MANAGER_QUEUE_SEED_PREFIX,
            config.key().as_ref(),
        ],
        bump = queue.bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    #[account(
        mut,
        seeds = [
            MANAGER_SHARES_SEED_PREFIX,
            config.key().as_ref(),
            config.fee_recipient.key().as_ref()
        ],
        bump = fee_recipient_shares.bump,
    )]
    pub fee_recipient_shares: Account<'info, SupplyShares>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<SupplyShares>(),
        seeds = [
            MANAGER_SHARES_SEED_PREFIX,
            config.key().as_ref(),
            args.receiver.key().as_ref()
        ],
        bump
    )]
    pub receiver_shares: Account<'info, SupplyShares>,

    // pathfinder accounts
    #[account(mut)]
    pub pathfinder_config: Account<'info, Config>,
    #[account(mut)]
    pub vault_ata_quote: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_ata_quote: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub pathfinder_program: Program<'info, Pathfinder>,
    // NOTE: remaining accounts are pathfinder market, lender shares, and manager market config accounts.
    // These are not specified here but are passed in the context
    // the accounts are ordered by supply queue in threes [market, lender_shares, manager_market_config, ...]
    // Any excess accounts which exist in the withdraw queue but not in supply queue are tacked onto the end
}

// impl<'info, 'c: 'info> VaultAccounting<'info, 'c> for Deposit<'info> {}
impl<'info, 'c: 'info> VaultAccounting<'info, 'c> for Deposit<'info> {}
impl<'info, 'c: 'info> PathActions<'info, 'c> for Deposit<'info> {}
impl<'info, 'c: 'info> Deposit<'info> {
    pub fn handle(ctx: Context<'_, '_, 'c, 'info, Self>, args: DepositArgs) -> Result<()> {
        let Deposit {
            user,
            config,
            queue,
            fee_recipient_shares,
            receiver_shares,
            vault_ata_quote,
            user_ata_quote,
            pathfinder_config,
            pathfinder_program,
            token_program,
            system_program,
            ..
        } = ctx.accounts;

        let (fee_shares, new_total_assets) = Self::_accrued_fee_shares(
            config,
            &queue.withdraw_queue,
            ctx.remaining_accounts,
            pathfinder_config,
            pathfinder_program,
            RemainingAccountsPattern::TripleGrouping,
        )?;

        if fee_shares != 0 {
            fee_recipient_shares.shares = fee_recipient_shares
                .shares
                .checked_add(fee_shares)
                .ok_or(ManagerError::MathOverflow)?;
        }

        // Update `lastTotalAssets` to avoid an inconsistent state in a re-entrant context.
        // It is updated again in `_deposit`.
        config.last_total_assets = new_total_assets;

        let shares = Self::_convert_to_shares(
            args.assets,
            config.total_shares,
            new_total_assets,
            config.decimals_offset,
            false,
        )?;

        Self::_supply_path(
            args.assets,
            &user,
            &config,
            &queue.supply_queue,
            &vault_ata_quote,
            &user_ata_quote,
            &ctx.remaining_accounts,
            &pathfinder_config,
            &pathfinder_program,
            &token_program,
            &system_program,
        )?;

        receiver_shares.shares = receiver_shares
            .shares
            .checked_add(shares)
            .ok_or(ManagerError::MathOverflow)?;

        // Update last total assets
        config.last_total_assets = config
            .last_total_assets
            .checked_add(args.assets)
            .ok_or(ManagerError::MathOverflow)?;

        Ok(())
    }
}
