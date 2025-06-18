use anchor_lang::prelude::*;

use crate::error::*;
use crate::state::*;
use crate::traits::{
    owner::OwnerProtection,
    vault_accounting::{RemainingAccountsPattern, VaultAccounting},
};

use pathfinder::{program::Pathfinder, state::Config};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetFeeArgs {
    pub fee: u64,
}

#[derive(Accounts)]
#[instruction(args: SetFeeArgs)]
pub struct SetFee<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [
            MANAGER_CONFIG_SEED_PREFIX,
            &manager_config.quote_mint.as_ref(),
            &manager_config.symbol.as_bytes(),
            &manager_config.name.as_bytes(),
        ],
        bump = manager_config.bump,
    )]
    pub manager_config: Box<Account<'info, ManagerVaultConfig>>,

    #[account(
        mut,
        seeds = [
            MANAGER_SHARES_SEED_PREFIX,
            &manager_config.key().as_ref(),
            &manager_config.fee_recipient.key().as_ref()
        ],
        bump = fee_recipient_shares.bump,
    )]
    pub fee_recipient_shares: Account<'info, SupplyShares>,

    #[account(
        mut,
        seeds = [
            MANAGER_QUEUE_SEED_PREFIX,
            &manager_config.key().as_ref(),
        ],
        bump = queue.bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    // pathfinder accounts
    #[account(mut)]
    pub pathfinder_config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
    pub pathfinder_program: Program<'info, Pathfinder>,
    // NOTE: remaining accounts are pathfinder market, lender shares, and manager market config accounts.
    // These are not specified here but are passed in the context
    // the accounts are ordered by supply queue in pairs [market, lender_shares ...]
    // Any excess accounts which exist in the withdraw queue but not in supply queue are tacked onto the end
}

impl<'info> OwnerProtection<'info> for SetFee<'info> {}
impl<'info, 'c: 'info> VaultAccounting<'info, 'c> for SetFee<'info> {}

impl<'info, 'c: 'info> SetFee<'info> {
    pub fn validate(&self, args: &SetFeeArgs) -> Result<()> {
        self.is_owner(&self.user, &self.manager_config)?;

        if args.fee == self.manager_config.fee {
            return err!(ManagerError::AlreadySet);
        }

        if args.fee > MAX_FEE {
            return err!(ManagerError::MaxFeeExceeded);
        }

        if args.fee != 0 && self.manager_config.fee_recipient == Pubkey::default() {
            return err!(ManagerError::ZeroFeeRecipient);
        }

        Ok(())
    }

    pub fn handle(ctx: Context<'_, '_, 'c, 'info, Self>, args: SetFeeArgs) -> Result<()> {
        let SetFee {
            manager_config,
            fee_recipient_shares,
            queue,
            pathfinder_config,
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
        manager_config.last_total_assets = manager_config
            .last_total_assets
            .checked_add(new_total_assets)
            .ok_or(ManagerError::MathOverflow)?;

        manager_config.fee = args.fee;

        Ok(())
    }
}
