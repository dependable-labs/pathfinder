use anchor_lang::prelude::*;

declare_id!("7ALFC87zvuPvpp9h5Stq9SSP3kTCUJfhtirEZVJmZYy4");

pub mod instructions;
pub mod state;
pub mod error;
pub mod math;

use crate::state::*;
use crate::instructions::*;

#[program]
pub mod markets {

    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
        CreateMarket::handle(ctx, args)
    }
    
    // TODO: make this update_collateral and have it include init logic
    pub fn add_collateral(ctx: Context<AddCollateral>, args: AddCollateralArgs) -> Result<()> {
        AddCollateral::handle(ctx, args)
    }

    pub fn deposit(ctx: Context<Deposit>, args: DepositArgs) -> Result<()> {
        Deposit::handle(ctx, args)
    }

    pub fn withdraw(ctx: Context<Withdraw>, args: WithdrawArgs) -> Result<()> {
        Withdraw::handle(ctx, args)
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, args: DepositCollateralArgs) -> Result<()> {
        DepositCollateral::handle(ctx, args)
    }

    pub fn borrow(ctx: Context<Borrow>, args: BorrowArgs) -> Result<()> {
        Borrow::handle(ctx, args)
    }

}
