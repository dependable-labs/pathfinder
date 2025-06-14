use anchor_lang::prelude::*;

declare_id!("4JpJWm53pKAwsyJ5HxGoXRwFFW8FSr49mYjkRKzn7pyj");

pub mod error;
pub mod instructions;
pub mod state;
pub mod traits;
pub mod utils;

use crate::instructions::*;

#[program]
pub mod assistant_to_the_regional_manager {
    use super::*;

    pub fn create_manager(
        ctx: Context<CreateManager>,
        args: CreateManagerArgs
    ) -> Result<()> {
        CreateManager::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn set_fee<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, SetFee<'info>>,
        args: SetFeeArgs,
    ) -> Result<()> {
        SetFee::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn set_fee_recipient<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, SetFeeRecipient<'info>>,
        args: SetFeeRecipientArgs,
    ) -> Result<()> {
        SetFeeRecipient::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn submit_cap(
        ctx: Context<SubmitCap>,
        args: SubmitCapArgs
    ) -> Result<()> {
        SubmitCap::handle(ctx, args)
    }

    pub fn accept_cap(
        ctx: Context<AcceptCap>,
        args: AcceptCapArgs
    ) -> Result<()> {
        AcceptCap::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn revoke_pending_cap(
        ctx: Context<RevokePendingCap>,
        args: RevokePendingCapArgs,
    ) -> Result<()> {
        RevokePendingCap::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn submit_market_removal(
        ctx: Context<SubmitMarketRemoval>,
        args: SubmitMarketRemovalArgs,
    ) -> Result<()> {
        SubmitMarketRemoval::handle(ctx, args)
    }

    pub fn set_supply_queue<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, SetSupplyQueue<'info>>,
        args: SetSupplyQueueArgs,
    ) -> Result<()> {
        SetSupplyQueue::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn reorder_withdraw_queue(
        ctx: Context<ReorderWithdrawQueue>,
        args: ReorderWithdrawQueueArgs,
    ) -> Result<()> {
        ReorderWithdrawQueue::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn remove_from_withdraw_queue(
        ctx: Context<RemoveFromWithdrawQueue>,
        args: RemoveFromWithdrawQueueArgs,
    ) -> Result<()> {
        RemoveFromWithdrawQueue::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn submit_guardian(
        ctx: Context<SubmitGuardian>,
        args: SubmitGuardianArgs
    ) -> Result<()> {
        SubmitGuardian::handle(ctx, args)
    }

    pub fn accept_guardian(ctx: Context<AcceptGuardian>) -> Result<()> {
        AcceptGuardian::handle(ctx)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn revoke_pending_guardian(ctx: Context<RevokePendingGuardian>) -> Result<()> {
        RevokePendingGuardian::handle(ctx)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn set_curator(
        ctx: Context<SetCurator>,
        args: SetCuratorArgs
    ) -> Result<()> {
        SetCurator::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn set_allocator(
        ctx: Context<SetAllocator>,
        args: SetAllocatorArgs
    ) -> Result<()> {
        SetAllocator::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn submit_timelock(
        ctx: Context<SubmitTimelock>,
        args: SubmitTimelockArgs
    ) -> Result<()> {
        SubmitTimelock::handle(ctx, args)
    }

    pub fn accept_timelock(ctx: Context<AcceptTimelock>) -> Result<()> {
        AcceptTimelock::handle(ctx)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn revoke_pending_timelock(
        ctx: Context<RevokePendingTimelock>
    ) -> Result<()> {
        RevokePendingTimelock::handle(ctx)
    }

    pub fn deposit<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, Deposit<'info>>,
        args: DepositArgs,
    ) -> Result<()> {
        Deposit::handle(ctx, args)
    }

    pub fn withdraw<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, Withdraw<'info>>,
        args: WithdrawArgs,
    ) -> Result<()> {
        Withdraw::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn reallocate<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, Reallocate<'info>>,
        args: ReallocateArgs,
    ) -> Result<()> {
        Reallocate::handle(ctx, args)
    }
}

#[derive(Accounts)]
pub struct Initialize {}
