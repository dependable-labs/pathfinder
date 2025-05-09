use anchor_lang::prelude::*;
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};
use crate::{
  state::*, 
  error::ManagerError,
  instructions::Deposit,
  utils::accounts::validate_manager_market_config_pda
};

use pathfinder::{
    cpi::{accrue_interest, deposit},
    math::{min_u64, to_assets_up, zero_floor_sub},
    state::{LenderShares, Market},
};
pub trait PathActions<'info, 'c: 'info> {

  fn _supply_path(
    ctx: &Context<'_, '_, 'c, 'info, Deposit<'info>>,
    assets: u64,
  ) -> Result<()> {
    let user = &ctx.accounts.user;
    let config = &ctx.accounts.config;
    let queue = &ctx.accounts.queue;
    let remaining_accounts = &ctx.remaining_accounts;
    let pathfinder_config = &ctx.accounts.pathfinder_config;
    let pathfinder_program = &ctx.accounts.pathfinder_program;
    let vault_ata_quote = &ctx.accounts.vault_ata_quote;
    let user_ata_quote = &ctx.accounts.user_ata_quote;
    let token_program = &ctx.accounts.token_program;
    let system_program = &ctx.accounts.system_program;

    let mut queue_index = 0;
    let mut assets = assets;

    for i in (0..remaining_accounts.len()).step_by(3) {

      let market_info = &remaining_accounts[i];
      let lender_shares_info = &remaining_accounts[i + 1];
      let manager_market_config_info = &remaining_accounts[i + 2];

      let mut shares: u64 = 0;

      // if queue_index is greater than queue.supply_queue.len()
      // we've processed all markets in the supply queue
      if queue_index >= queue.supply_queue.len() {
        break;
      }

      // remaining accounts must be in the same order as the supply queue
      let supply_queue_market = queue.supply_queue[queue_index];
      // market_info seed derivation has already been validated in total_assets()
      let market_account: Account<'_, Market> = Account::<Market>::try_from(&market_info)?;
      if market_info.key() != supply_queue_market {
        return err!(ManagerError::InvalidSupplyQueue);
      }
 
      // validate that lender shares account data
      // lender_shares seed derivation has already been validated in total_assets()
      if !lender_shares_info.data_is_empty() {
        let lender_account = Account::<LenderShares>::try_from(&lender_shares_info)?;
        shares = lender_account.shares;
      }

      // validate manager market config account
      let manager_market_config_account = Account::<ManagerMarketConfig>::try_from(&manager_market_config_info)?;
      validate_manager_market_config_pda(
        &manager_market_config_info.key(),
        &market_info.key(),
        &config.key(),
      )?;

      // check supply cap, if 0, skip
      let supply_cap = manager_market_config_account.cap;
      if supply_cap == 0 {
        continue;
      }

      // accrue interest for market
      let accrue_ctx = CpiContext::new(
        pathfinder_program.to_account_info(),
        pathfinder::cpi::accounts::AccrueInterest {
          user: user.to_account_info(),
          market: market_account.to_account_info(),
          config: pathfinder_config.to_account_info(),
        }
      );

      accrue_interest(accrue_ctx)?;

      // get supply shares for manager's position in market
      let deposit_shares = shares;

      // // convert supply shares to assets, rounding up
      let supply_assets = to_assets_up(
        deposit_shares,
        market_account.total_deposits()?,
        market_account.total_shares
      )?;

      // calculate toSupply as min of (supplyCap - supplyAssets, assets)
      let to_supply = min_u64(zero_floor_sub(supply_cap, supply_assets), assets);

      if to_supply > 0 {

        let deposit_ctx = CpiContext::new(
          pathfinder_program.to_account_info(),
          pathfinder::cpi::accounts::Deposit {
            user: user.to_account_info(),
            market: market_info.to_account_info(),
            config: pathfinder_config.to_account_info(),
            lender_shares: lender_shares_info.to_account_info(),
            vault_ata_quote: vault_ata_quote.to_account_info(),
            user_ata_quote: user_ata_quote.to_account_info(),
            token_program: token_program.to_account_info(),
            system_program: system_program.to_account_info(),
          },
        );

        let deposit_args = pathfinder::instructions::DepositArgs {
          amount: to_supply,
          shares: 0,
          owner: config.key(),
        };

        // Skip markets that fail by catching any errors
        if deposit(deposit_ctx, deposit_args).is_ok() {
            assets = assets.checked_sub(to_supply).ok_or(ManagerError::MathUnderflow)?;
        }
      }

      if assets == 0 {
        break;
      }

      queue_index += 1;
    }

    require!(
      assets == 0,
      ManagerError::MarketCapReached
    );

    if assets != 0 {
      return err!(ManagerError::MarketCapReached);
    }

    Ok(())
  }
}

