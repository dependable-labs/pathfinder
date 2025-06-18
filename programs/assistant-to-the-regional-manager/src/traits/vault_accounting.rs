use anchor_lang::prelude::*;

use crate::{
    error::ManagerError,
    state::{ManagerVaultConfig, SupplyShares},
};

use crate::utils::accounts::{validate_pathfinder_market};
use pathfinder::{
    cpi::view_expected_supply_assets,
    instructions::views::supply_balances::{
        validate_lender_shares, ViewMarketWithLenderSharesArgs,
    },
    math::{mul_div_down, mul_div_up, zero_floor_sub, WAD},
    program::Pathfinder,
    state::{Config, LenderShares, Market},
};
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RemainingAccountsPattern {
    TripleGrouping,
    PairGrouping,
}
pub trait VaultAccounting<'info, 'c: 'info> {
    fn validate_account_lengths(
        market_accounts: &[AccountInfo<'info>],
        withdraw_queue: &[Pubkey],
        step_size: usize,
    ) -> Result<()> {
        // Checks that full withdraw queue is provided
        // Protects against edgecase supplyqueue.len() > withdraw_queue.len()
        // Guardian must set a new supply queue without the removed market prior to depositors calling deposit.
        require!(
            market_accounts.len() / step_size == withdraw_queue.len(),
            ManagerError::InvalidWithdrawQueue
        );

        Ok(())
    }

    fn validate_market_order(
        market_info: &AccountInfo<'info>,
        withdraw_queue: &[Pubkey],
        queue_index: usize,
        processing_mode: RemainingAccountsPattern,
        withdraw_queue_set: &HashSet<Pubkey>,
    ) -> Result<()> {
        match processing_mode {
            RemainingAccountsPattern::PairGrouping => {
                require!(
                    withdraw_queue[queue_index] == market_info.key(),
                    ManagerError::InvalidWithdrawQueue
                );
            }
            RemainingAccountsPattern::TripleGrouping => {
                require!(
                    withdraw_queue_set.contains(&market_info.key()),
                    ManagerError::MarketNotInQueue
                );
            }
        }
        Ok(())
    }

    #[inline(never)]
    fn total_assets(
        manager_config: &Account<'info, ManagerVaultConfig>,
        withdraw_queue: &Vec<anchor_lang::prelude::Pubkey>,
        market_accounts: &'info [AccountInfo<'info>],
        pathfinder_config: &Account<'info, Config>,
        pathfinder_program: &Program<'info, Pathfinder>,
        processing_mode: RemainingAccountsPattern,
    ) -> Result<u64> {
        // Determine step size based on processing mode
        let step_size = match processing_mode {
            RemainingAccountsPattern::TripleGrouping => 3,
            RemainingAccountsPattern::PairGrouping => 2,
        };

        // Validate account lengths
        Self::validate_account_lengths(market_accounts, withdraw_queue, step_size)?;

        // Create set of valid market pubkeys for quick lookup
        let withdraw_queue_set: HashSet<_> =
            withdraw_queue.iter().map(|market| market.key()).collect();

        // Process markets
        let mut assets: u64 = 0;
        let mut queue_index = 0;

        for i in (0..market_accounts.len()).step_by(step_size) {
            let market_info = &market_accounts[i];
            let lender_shares_info = &market_accounts[i + 1];

            let market_account = Account::<Market>::try_from(market_info)?;
            validate_pathfinder_market(&market_info, &market_account)?;

            validate_lender_shares(lender_shares_info, &market_info, &manager_config.key())?;
            let lender_shares_account = Account::<LenderShares>::try_from(lender_shares_info)?;

            // Validate market order
            Self::validate_market_order(
                &market_info,
                withdraw_queue,
                queue_index,
                processing_mode,
                &withdraw_queue_set,
            )?;

            // Get market assets
            let market_assets = Self::get_market_assets(
                &market_account,
                &lender_shares_account,
                manager_config,
                pathfinder_config,
                pathfinder_program,
            )?;

            assets = assets
                .checked_add(market_assets)
                .ok_or(ManagerError::MathOverflow)?;

            queue_index += 1;
        }

        Ok(assets)
    }

    // Helper function to process individual market assets
    fn get_market_assets(
        market: &Account<'info, Market>,
        lender_shares: &Account<'info, LenderShares>,
        manager_config: &Account<'info, ManagerVaultConfig>,
        pathfinder_config: &Account<'info, Config>,
        pathfinder_program: &Program<'info, Pathfinder>,
    ) -> Result<u64> {
        let view_market_ctx = CpiContext::new(
            pathfinder_program.to_account_info(),
            pathfinder::cpi::accounts::ViewMarketWithLenderShares {
                market: market.to_account_info(),
                config: pathfinder_config.to_account_info(),
                lender_shares: lender_shares.to_account_info(),
            },
        );

        let expected_assets = view_expected_supply_assets(
            view_market_ctx,
            ViewMarketWithLenderSharesArgs {
                owner: manager_config.key(),
            },
        )?;

        Ok(expected_assets.get())
    }

    // Computes and returns the fee shares (`feeShares`) to accrue to the fee recipient and the new vault's total assets
    // (`newTotalAssets`).
    fn _accrued_fee_shares(
        manager_config: &Account<'info, ManagerVaultConfig>,
        withdraw_queue: &Vec<anchor_lang::prelude::Pubkey>,
        market_accounts: &'info [AccountInfo<'info>],
        pathfinder_config: &Account<'info, Config>,
        pathfinder_program: &Program<'info, Pathfinder>,
        account_pattern: RemainingAccountsPattern,
    ) -> Result<(u64, u64)> {
        let new_total_assets = Self::total_assets(
            manager_config,
            withdraw_queue,
            market_accounts,
            pathfinder_config,
            pathfinder_program,
            account_pattern,
        )?;

        let mut fee_shares = 0;

        let total_interest = zero_floor_sub(new_total_assets, manager_config.last_total_assets);

        if total_interest != 0 && manager_config.fee != 0 {
            // It is acknowledged that `fee_assets` may be rounded down to 0 if `total_interest * fee < WAD`.
            let fee_assets = mul_div_down(
                total_interest as u128,
                manager_config.fee as u128,
                WAD as u128,
            )?;

            // The fee assets is subtracted from the total assets in this calculation to compensate for the fact
            // that total assets is already increased by the total interest (including the fee assets).
            fee_shares = Self::_convert_to_shares(
                fee_assets,
                manager_config.total_shares,
                new_total_assets.checked_sub(fee_assets).unwrap(),
                manager_config.decimals_offset,
                false,
            )?;
        }

        Ok((fee_shares, new_total_assets))
    }

    fn max_withdraw(
        owner_supply: &Account<'info, SupplyShares>,
        manager_config: &Account<'info, ManagerVaultConfig>,
    ) -> Result<u64> {
        Self::_convert_to_assets(
            owner_supply.shares,
            manager_config.last_total_assets,
            manager_config.total_shares,
            manager_config.decimals_offset,
            false,
        )
    }

    fn _convert_to_assets(
        shares: u64,
        last_total_assets: u64,
        total_shares: u64,
        decimals_offset: u8,
        round_up: bool,
    ) -> Result<u64> {
        if round_up {
            Ok(mul_div_up(
                shares as u128,
                (last_total_assets + 1) as u128,
                (total_shares + 10_u64.pow(decimals_offset as u32)) as u128,
            )?)
        } else {
            Ok(mul_div_down(
                shares as u128,
                (last_total_assets + 1) as u128,
                (total_shares + 10_u64.pow(decimals_offset as u32)) as u128,
            )?)
        }
    }

    // Returns the amount of shares that the vault would exchange for the amount of `assets` provided.
    // It assumes that the arguments `newTotalSupply` and `newTotalAssets` are up to date.
    fn _convert_to_shares(
        assets: u64,
        total_shares: u64,
        total_assets: u64,
        decimals_offset: u8,
        round_up: bool,
    ) -> Result<u64> {
        if round_up {
            Ok(mul_div_up(
                assets as u128,
                (total_shares + 10_u64.pow(decimals_offset as u32)) as u128,
                (total_assets + 1) as u128,
            )?)
        } else {
            Ok(mul_div_down(
                assets as u128,
                (total_shares + 10_u64.pow(decimals_offset as u32)) as u128,
                (total_assets + 1) as u128,
            )?)
        }
    }
}
