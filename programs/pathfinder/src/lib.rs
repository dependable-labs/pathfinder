use anchor_lang::prelude::*;

declare_id!("7ALFC87zvuPvpp9h5Stq9SSP3kTCUJfhtirEZVJmZYy4");

pub mod error;
pub mod instructions;
pub mod math;
pub mod oracle;
pub mod state;
pub mod traits;

use crate::instructions::*;

#[program]
pub mod pathfinder {

    use super::*;

    #[access_control(ctx.accounts.validate(&args))]
    pub fn init(ctx: Context<Init>, args: InitArgs) -> Result<()> {
        Init::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn init_delegate(ctx: Context<InitDelegate>, args: InitDelegateArgs) -> Result<()> {
        InitDelegate::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn update_delegate(ctx: Context<UpdateDelegate>, args: UpdateDelegateArgs) -> Result<()> {
        UpdateDelegate::handle(ctx, args)
    }

    pub fn create_market(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
        CreateMarket::handle(ctx, args)
    }

    pub fn deposit(ctx: Context<Deposit>, args: DepositArgs) -> Result<()> {
        Deposit::handle(ctx, args)
    }

    pub fn init_lender_shares(
        ctx: Context<InitLenderShares>,
        args: InitLenderSharesArgs,
    ) -> Result<()> {
        InitLenderShares::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn borrow(ctx: Context<Borrow>, args: BorrowArgs) -> Result<()> {
        Borrow::handle(ctx, args)
    }

    pub fn withdraw(ctx: Context<Withdraw>, args: WithdrawArgs) -> Result<()> {
        Withdraw::handle(ctx, args)
    }

    pub fn withdraw_collateral(
        ctx: Context<WithdrawCollateral>,
        args: WithdrawCollateralArgs,
    ) -> Result<()> {
        WithdrawCollateral::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn deposit_collateral(
        ctx: Context<DepositCollateral>,
        args: DepositCollateralArgs,
    ) -> Result<()> {
        DepositCollateral::handle(ctx, args)
    }

    pub fn accrue_interest(ctx: Context<AccrueInterest>) -> Result<()> {
        AccrueInterest::handle(ctx)
    }

    pub fn liquidate(ctx: Context<Liquidate>, args: LiquidateArgs) -> Result<()> {
        Liquidate::handle(ctx, args)
    }

    pub fn repay(ctx: Context<Repay>, args: RepayArgs) -> Result<()> {
        Repay::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn update_fee(ctx: Context<UpdateFee>, args: UpdateFeeArgs) -> Result<()> {
        UpdateFee::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn update_authority(
        ctx: Context<UpdateAuthority>,
        args: UpdateAuthorityArgs,
    ) -> Result<()> {
        UpdateAuthority::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate(&args))]
    pub fn update_recipient(
        ctx: Context<UpdateRecipient>,
        args: UpdateRecipientArgs,
    ) -> Result<()> {
        UpdateRecipient::handle(ctx, args)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn withdraw_fee(ctx: Context<WithdrawFee>, args: WithdrawFeeArgs) -> Result<()> {
        WithdrawFee::handle(ctx, args)
    }

    // views
    pub fn view_market_balances(ctx: Context<ViewMarket>) -> Result<[u64; 4]> {
        let balances = ViewMarket::expected_market_balances(ctx)?;
        Ok([balances.0, balances.1, balances.2, balances.3])
    }

    pub fn view_total_supply_assets(ctx: Context<ViewMarket>) -> Result<u64> {
        ViewMarket::expected_total_supply_assets(ctx)
    }

    pub fn view_total_borrow_assets(ctx: Context<ViewMarket>) -> Result<u64> {
        ViewMarket::expected_total_borrow_assets(ctx)
    }

    pub fn view_total_shares(ctx: Context<ViewMarket>) -> Result<u64> {
        ViewMarket::expected_total_shares(ctx)
    }

    pub fn view_expected_supply_assets(ctx: Context<ViewMarketWithLenderShares>, args: ViewMarketWithLenderSharesArgs) -> Result<u64> {
        ViewMarketWithLenderShares::expected_supply_assets(ctx, args)
    }

    pub fn view_expected_borrow_assets(
        ctx: Context<ViewMarket>,
        user_borrow_shares: u64,
    ) -> Result<u64> {
        ViewMarket::expected_borrow_assets(ctx, user_borrow_shares)
    }
}
