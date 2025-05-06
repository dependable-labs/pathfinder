
use anchor_lang::prelude::*;
use crate::{
  error::ManagerError,
  instructions::Deposit,
};

use pathfinder::math::{mul_div_down, mul_div_up, zero_floor_sub, WAD}; 
use pathfinder::cpi::view_expected_supply_assets;
use pathfinder::state::{Market, LenderShares};
use std::collections::HashSet;

pub trait VaultAccounting<'info, 'c: 'info> {

  fn total_assets(
    ctx: &Context<'_, '_, 'c, 'info, Deposit<'info>>,
  ) -> Result<u64> {
    let mut assets: u64 = 0;
    let market_accounts = ctx.remaining_accounts;
    let withdraw_queue = &ctx.accounts.queue.withdraw_queue;

    // checking against set errors on duplicate and ensures all withdraw_queue accounts are accounted for
    let withdraw_queue_set: HashSet<_> = withdraw_queue
      .iter()
      .map(|market| market.key())
      .collect();

    // order of withdraw queue accounts is not guaranteed
    for i in (0..market_accounts.len()).step_by(3) {

      // check to ensure market is in withdraw queue
      if !withdraw_queue_set.contains(&market_accounts[i].key()) {
        return err!(ManagerError::MarketNotInQueue);
      }

      let market_account = Account::<Market>::try_from(&market_accounts[i])?;

      // validate that lender shares account is valid
      // TODO: if try_from fails, we need a way to verify that its because this is the first deposit and not becuase the account is invalid
      let lender_shares_account = if market_accounts[i + 1].data_is_empty() {
          // return err!(ManagerError::LenderSharesAccountNotInitialized);
          continue;
      } else {
          Account::<LenderShares>::try_from(&market_accounts[i + 1])?
      };

      // validate that seed derivation is correct
      // validate_pathfinder_market(&market_accounts[i])?;
      // validate_pathfinder_lender_shares(&market_account.key(), &lender_shares_account.key(), &manager_config.key())?;

      let view_market_ctx = CpiContext::new(
        ctx.accounts.pathfinder_program.to_account_info(),
        pathfinder::cpi::accounts::ViewMarket {
          market: market_account.to_account_info(),
          config: ctx.accounts.pathfinder_config.to_account_info(),
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

  // @dev Computes and returns the fee shares (`feeShares`) to mint and the new vault's total assets
  // (`newTotalAssets`).
  fn _accrued_fee_shares(
    ctx: &Context<'_, '_, 'c, 'info, Deposit<'info>>,
  ) -> Result<(u64, u64)> {
    let new_total_assets = Self::total_assets(ctx)?;
    let manager_config = &ctx.accounts.config;

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