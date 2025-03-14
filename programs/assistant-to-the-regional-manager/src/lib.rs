use anchor_lang::prelude::*;

declare_id!("4JpJWm53pKAwsyJ5HxGoXRwFFW8FSr49mYjkRKzn7pyj");

pub mod instructions;
pub mod state;
pub mod error;
pub mod traits;

use crate::instructions::*;

#[program]
pub mod assistant_to_the_regional_manager {
    use super::*;

    pub fn create_manager(ctx: Context<CreateManager>, args: CreateManagerArgs) -> Result<()> {
        CreateManager::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn submit_cap(ctx: Context<SubmitCap>, args: SubmitCapArgs) -> Result<()> {
        SubmitCap::handle(ctx, args)
    }

    pub fn accept_cap(ctx: Context<AcceptCap>, args: AcceptCapArgs) -> Result<()> {
        AcceptCap::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn revoke_pending_cap(ctx: Context<RevokePendingCap>, args: RevokePendingCapArgs) -> Result<()> {
        RevokePendingCap::handle(ctx, args)
    }

    pub fn set_supply_queue(ctx: Context<SetSupplyQueue>, args: SetSupplyQueueArgs) -> Result<()> {
        SetSupplyQueue::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn submit_guardian(ctx: Context<SubmitGuardian>, args: SubmitGuardianArgs) -> Result<()> {
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
    pub fn set_curator(ctx: Context<SetCurator>, args: SetCuratorArgs) -> Result<()> {
        SetCurator::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn set_allocator(ctx: Context<SetAllocator>, args: SetAllocatorArgs) -> Result<()> {
        SetAllocator::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn submit_timelock(ctx: Context<SubmitTimelock>, args: SubmitTimelockArgs) -> Result<()> {
        SubmitTimelock::handle(ctx, args)
    }

    pub fn accept_timelock(ctx: Context<AcceptTimelock>) -> Result<()> {
        AcceptTimelock::handle(ctx)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn revoke_pending_timelock(ctx: Context<RevokePendingTimelock>) -> Result<()> {
        RevokePendingTimelock::handle(ctx)
    }

}


#[derive(Accounts)]
pub struct Initialize {}
