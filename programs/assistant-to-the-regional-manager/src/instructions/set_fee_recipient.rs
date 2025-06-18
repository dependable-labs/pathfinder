use anchor_lang::prelude::*;

use crate::error::*;
use crate::state::*;
use crate::traits::{
    owner::OwnerProtection,
    vault_accounting::{RemainingAccountsPattern, VaultAccounting},
};

use pathfinder::{program::Pathfinder, state::Config};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetFeeRecipientArgs {
    pub new_fee_recipient: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: SetFeeRecipientArgs)]
pub struct SetFeeRecipient<'info> {
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

    // new fee recipient is always expected to show up with a new / fresh account
    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<SupplyShares>(),
        seeds = [
            MANAGER_SHARES_SEED_PREFIX,
            &manager_config.key().as_ref(),
            args.new_fee_recipient.key().as_ref()
        ],
        bump
    )]
    pub new_fee_recipient_shares: Account<'info, SupplyShares>,

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

impl<'info> OwnerProtection<'info> for SetFeeRecipient<'info> {}
impl<'info, 'c: 'info> VaultAccounting<'info, 'c> for SetFeeRecipient<'info> {}

impl<'info, 'c: 'info> SetFeeRecipient<'info> {
    pub fn validate(&self, args: &SetFeeRecipientArgs) -> Result<()> {
        self.is_owner(&self.user, &self.manager_config)?;

        if args.new_fee_recipient == self.manager_config.fee_recipient {
            return err!(ManagerError::AlreadySet);
        }

        if args.new_fee_recipient == Pubkey::default() {
            return err!(ManagerError::ZeroFeeRecipient);
        }

        if self.manager_config.fee != 0 && self.manager_config.fee_recipient == Pubkey::default() {
            return err!(ManagerError::ZeroFeeRecipient);
        }

        Ok(())
    }

    pub fn handle(ctx: Context<'_, '_, 'c, 'info, Self>, args: SetFeeRecipientArgs) -> Result<()> {
        let SetFeeRecipient {
            manager_config,
            fee_recipient_shares,
            new_fee_recipient_shares,
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

        // initialize recipient shares
        new_fee_recipient_shares.set_inner(SupplyShares {
            bump: ctx.bumps.new_fee_recipient_shares,
            shares: 0,
        });

        manager_config.fee_recipient = args.new_fee_recipient;

        Ok(())
    }
}
