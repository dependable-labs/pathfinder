use anchor_lang::prelude::*;
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};
use crate::{
  state::*, 
  error::ManagerError,
  instructions::Deposit,
};

use pathfinder::{
    program::Pathfinder,
    cpi::{accrue_interest, deposit},
    math::{min_u64, mul_div_down, mul_div_up, to_assets_up, zero_floor_sub, WAD},
    state::{Config, LenderShares, Market},
};
pub trait PathActions<'info, 'c: 'info> {

  fn _supply_path(
    ctx: &Context<'_, '_, 'c, 'info, Deposit<'info>>,
    assets: &mut u64,
    // assets: &mut u64,
    // user: &Signer<'info>,
    // config: &Account<'info, ManagerVaultConfig>,
    // queue: &Account<'info, QueueState>,
    // pathfinder_config: &Account<'info, Config>,
    // pathfinder_program: &Program<'info, Pathfinder>,
    // vault_ata_quote: &Account<'info, TokenAccount>,
    // user_ata_quote: &Account<'info, TokenAccount>,
    // token_program: &Program<'info, Token>,
    // system_program: &Program<'info, System>,
    // remaining_accounts: &[AccountInfo<'info>],
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


    for i in 0..queue.supply_queue.len() {
      let market_account = Account::<Market>::try_from(&remaining_accounts[i])?;
      let lender_shares_account = Account::<LenderShares>::try_from(&remaining_accounts[i + 1])?;
      let market_config_account = Account::<MarketConfig>::try_from(&remaining_accounts[i + 2])?;

      // get market id from queue
      // check supply cap, if 0, skip
      let supply_cap = market_config_account.cap;
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
      let deposit_shares = lender_shares_account.shares;

      // convert supply shares to assets, rounding up
      let supply_assets = to_assets_up(
        deposit_shares,
        market_account.total_deposits()?,
        market_account.total_shares
      )?;

      // calculate toSupply as min of (supplyCap - supplyAssets, assets)
      let to_supply = min_u64(zero_floor_sub(supply_cap, supply_assets), *assets);


      if to_supply > 0 {

        let deposit_ctx = CpiContext::new(
          pathfinder_program.to_account_info(),
          pathfinder::cpi::accounts::Deposit {
            user: user.to_account_info(),
            market: market_account.to_account_info(),
            config: pathfinder_config.to_account_info(),
            lender_shares: lender_shares_account.to_account_info(),
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
            *assets = assets.checked_sub(to_supply).ok_or(ManagerError::MathUnderflow)?;
        }
      }

      if *assets == 0 {
        break;
      }
    }

    if *assets != 0 {
      return Err(ManagerError::MarketCapReached.into());
    }

    Ok(())
  }
}

