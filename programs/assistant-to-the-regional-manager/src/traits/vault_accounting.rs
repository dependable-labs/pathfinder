
use anchor_lang::prelude::*;
use anchor_lang::Bumps;

use crate::{
  error::ManagerError,
  state::ManagerVaultConfig,
};

use pathfinder::{
  math::{mul_div_down, mul_div_up, zero_floor_sub, WAD}, 
  cpi::view_expected_supply_assets,
  state::{Market, LenderShares, Config},
  program::Pathfinder,
};
use std::collections::HashSet;
use crate::utils::accounts::{
  validate_pathfinder_market_pda, 
  validate_pathfinder_lender_shares_pda,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RemainingAccountsPattern{
    TripleGrouping,
    PairGrouping,
}
pub trait VaultAccounting<'info, 'c: 'info>{

  fn total_assets(
    manager_config: &Account<'info, ManagerVaultConfig>,
    withdraw_queue: &Vec<anchor_lang::prelude::Pubkey>,
    market_accounts: &'info [AccountInfo<'info>],
    pathfinder_config: &Account<'info, Config>,
    pathfinder_program: &Program<'info, Pathfinder>,
    processing_mode: RemainingAccountsPattern
  ) -> Result<u64> {

    let step_size = match processing_mode {
      RemainingAccountsPattern::TripleGrouping => 3,
      RemainingAccountsPattern::PairGrouping => 2
    };

    let mut assets: u64 = 0;

    // checking against set errors on duplicate and ensures all withdraw_queue accounts are accounted for
    let withdraw_queue_set: HashSet<_> = withdraw_queue
      .iter()
      .map(|market| market.key())
      .collect();

    // order of withdraw queue accounts is not guaranteed
    for i in (0..market_accounts.len()).step_by(step_size) {

      let market_info = &market_accounts[i];
      let lender_shares_info = &market_accounts[i + 1];

      // check to ensure market is in withdraw queue
      // Also protects against edgecase supplyqueue.len() > withdraw_queue.len()
      // The guardian must set a new supply queue without the removed market prior to depositors calling deposit.
      // drastically reduces complexity of the deposit account checking logic
      if !withdraw_queue_set.contains(&market_info.key()) {
        return err!(ManagerError::MarketNotInQueue);
      }

      // validate market account
      let market_account = Account::<Market>::try_from(market_info)?;
      validate_pathfinder_market_pda(&market_info.key(), &market_account)?;

      // validate lender shares account
      validate_pathfinder_lender_shares_pda(&market_info.key(), &manager_config.key(), &lender_shares_info.key())?;
      let lender_shares_account = if lender_shares_info.data_is_empty() {
        // if the lender shares account is empty market doesn't have position
        // skip the expected assets calculation
        continue;
      } else {
        Account::<LenderShares>::try_from(&lender_shares_info)?
      };

      let view_market_ctx = CpiContext::new(
        pathfinder_program.to_account_info(),
        pathfinder::cpi::accounts::ViewMarket {
          market: market_info.to_account_info(),
          config: pathfinder_config.to_account_info(),
        },
      );

      let expected_assets = view_expected_supply_assets(
        view_market_ctx,
        lender_shares_account.shares)?;

      assets = assets
        .checked_add(expected_assets.get())
        .ok_or(ManagerError::MathOverflow)?;
    }

    Ok(assets)
  }

  // Computes and returns the fee shares (`feeShares`) to mint and the new vault's total assets
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
      account_pattern
    )?;

    let mut fee_shares = 0;

    let total_interest = zero_floor_sub(new_total_assets, manager_config.last_total_assets);

    if total_interest != 0 && manager_config.fee != 0 {
        // It is acknowledged that `fee_assets` may be rounded down to 0 if `total_interest * fee < WAD`.
        let fee_assets = mul_div_down(
          total_interest as u128,
          manager_config.fee as u128, 
          WAD as u128
        )?;

        // The fee assets is subtracted from the total assets in this calculation to compensate for the fact
        // that total assets is already increased by the total interest (including the fee assets).
        fee_shares =
            Self::_convert_to_shares_with_totals(
                fee_assets,
                manager_config.total_shares,
                new_total_assets.checked_sub(fee_assets).unwrap(),
                manager_config.decimals_offset,
                false,
            )?;
    }

    Ok((fee_shares, new_total_assets))
  }


  // Returns the amount of shares that the vault would exchange for the amount of `assets` provided.
  // It assumes that the arguments `newTotalSupply` and `newTotalAssets` are up to date.
  fn _convert_to_shares_with_totals(
      assets: u64,
      new_total_supply: u64,
      new_total_assets: u64,
      decimals_offset: u8,
      round_up: bool,
  ) -> Result<u64> {

    if round_up {
      Ok(mul_div_up(
        assets as u128,
        (new_total_supply + 10_u64.pow(decimals_offset as u32)) as u128,
        (new_total_assets + 1) as u128
      )?)
    } else {
      Ok(mul_div_down(
        assets as u128,
        (new_total_supply + 10_u64.pow(decimals_offset as u32)) as u128,
        (new_total_assets + 1) as u128
        )?)
    }
  }
}