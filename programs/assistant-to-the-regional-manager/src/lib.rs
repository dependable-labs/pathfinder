use anchor_lang::prelude::*;

declare_id!("4JpJWm53pKAwsyJ5HxGoXRwFFW8FSr49mYjkRKzn7pyj");

pub mod instructions;
pub mod state;
pub mod error;

use crate::instructions::*;

#[program]
pub mod assistant_to_the_regional_manager {
    use super::*;

    pub fn create_manager(ctx: Context<CreateManager>, args: CreateManagerArgs) -> Result<()> {
        CreateManager::handle(ctx, args)
    }

    pub fn submit_cap(ctx: Context<SubmitCap>, args: SubmitCapArgs) -> Result<()> {
        SubmitCap::handle(ctx, args)
    }

    pub fn accept_cap(ctx: Context<AcceptCap>, args: AcceptCapArgs) -> Result<()> {
        AcceptCap::handle(ctx, args)
    }

    pub fn set_supply_queue(ctx: Context<SetSupplyQueue>, args: SetSupplyQueueArgs) -> Result<()> {
        SetSupplyQueue::handle(ctx, args)
    }

    // pub fn update_market_config(ctx: Context<UpdateMarketConfig>, args: UpdateMarketConfigArgs) -> Result<()> {
    //     UpdateMarketConfig::handle(ctx, args)
    // }

    pub fn submit_timelock(ctx: Context<SubmitTimelock>, args: SubmitTimelockArgs) -> Result<()> {
        SubmitTimelock::handle(ctx, args)
    }

    pub fn accept_timelock(ctx: Context<AcceptTimelock>) -> Result<()> {
        AcceptTimelock::handle(ctx)
    }
}


#[derive(Accounts)]
pub struct Initialize {}
