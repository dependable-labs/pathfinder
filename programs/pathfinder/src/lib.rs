use anchor_lang::prelude::*;

declare_id!("7ALFC87zvuPvpp9h5Stq9SSP3kTCUJfhtirEZVJmZYy4");

pub mod instructions;
pub mod state;
pub mod error;

use crate::state::*;
use crate::instructions::*;

#[program]
pub mod markets {

    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
        CreateMarket::handle(ctx, args)
    }

    pub fn deposit(ctx: Context<Deposit>, args: DepositArgs) -> Result<()> {
        Deposit::handle(ctx, args)
    }
}
