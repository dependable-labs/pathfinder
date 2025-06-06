use crate::{
    error::ManagerError, generate_manager_config_seeds, state::*,
    utils::accounts::validate_manager_market_config_pda,
};
use anchor_lang::prelude::*;
use anchor_spl::token::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Token, TokenAccount},
};

use pathfinder::{
    cpi::{accrue_interest, deposit, withdraw},
    math::{min_u64, to_assets_down, to_assets_up, zero_floor_sub},
    program::Pathfinder,
    state::{Config, LenderShares, Market},
};
pub trait PathActions<'info, 'c: 'info> {
    fn _supply_path(
        assets: u64,
        user: &Signer<'info>,
        config: &Account<'info, ManagerVaultConfig>,
        supply_queue: &Vec<Pubkey>,
        vault_ata_quote: &Account<'info, TokenAccount>,
        user_ata_quote: &Account<'info, TokenAccount>,
        remaining_accounts: &'info [AccountInfo<'info>],
        pathfinder_config: &Account<'info, Config>,
        pathfinder_program: &Program<'info, Pathfinder>,
        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
    ) -> Result<()> {
        let mut queue_index = 0;
        let mut assets = assets;

        for i in (0..remaining_accounts.len()).step_by(3) {
            let market_info = &remaining_accounts[i];
            let lender_shares_info = &remaining_accounts[i + 1];
            let manager_market_config_info = &remaining_accounts[i + 2];

            let mut shares: u64 = 0;

            // if queue_index is greater than queue.supply_queue.len()
            // we've processed all markets in the supply queue, only markets in withdraw_queue remain
            if queue_index >= supply_queue.len() {
                break;
            }

            // remaining accounts must be in the same order as the supply queue
            let supply_queue_market = supply_queue[queue_index];
            // market_info seed derivation has already been validated in total_assets()
            let market_account = Account::<Market>::try_from(&market_info)?;
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
            let manager_market_config_account =
                Account::<ManagerMarketConfig>::try_from(&manager_market_config_info)?;
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
                },
            );

            accrue_interest(accrue_ctx)?;

            // get supply shares for manager's position in market
            let deposit_shares = shares;

            // convert supply shares to assets, rounding up
            let supply_assets = to_assets_up(
                deposit_shares,
                market_account.total_deposits as u64,
                market_account.total_shares,
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
                    assets = assets
                        .checked_sub(to_supply)
                        .ok_or(ManagerError::MathUnderflow)?;
                }
            }

            if assets == 0 {
                break;
            }

            queue_index += 1;
        }

        require!(assets == 0, ManagerError::MarketCapReached);

        if assets != 0 {
            return err!(ManagerError::MarketCapReached);
        }

        Ok(())
    }

    #[inline(never)]
    fn process_market_withdrawal(
        assets: u64,
        user: &Signer<'info>,
        recipient: &AccountInfo<'info>,
        manager_config: &Account<'info, ManagerVaultConfig>,
        market: &Account<'info, Market>,
        lender_shares: &Account<'info, LenderShares>,
        pathfinder_config: &Account<'info, Config>,
        pathfinder_program: &Program<'info, Pathfinder>,
        vault_ata_quote: &Account<'info, TokenAccount>,
        quote_mint: &Account<'info, Mint>,
        recipient_ata_quote: &Account<'info, TokenAccount>,
        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
        associated_token_program: &Program<'info, AssociatedToken>,
    ) -> Result<u64> {
        let (supply_assets, _) = Self::_accrued_supply_balance(
            user,
            market,
            lender_shares,
            pathfinder_config,
            pathfinder_program,
        )?;

        let to_withdraw = min_u64(
            Self::_withdrawable(
                market.total_deposits as u64,
                market.total_borrows as u64,
                supply_assets,
                vault_ata_quote,
            )?,
            assets,
        );

        if to_withdraw > 0 {
            let seeds = generate_manager_config_seeds!(manager_config);
            let signer = &[&seeds[..]];

            let withdraw_ctx = CpiContext::new_with_signer(
                pathfinder_program.to_account_info(),
                pathfinder::cpi::accounts::Withdraw {
                    user: manager_config.to_account_info(),
                    recipient: recipient.to_account_info(),
                    market: market.to_account_info(),
                    config: pathfinder_config.to_account_info(),
                    lender_shares: lender_shares.to_account_info(),
                    vault_ata_quote: vault_ata_quote.to_account_info(),
                    position_delegate: None::<AccountInfo>,
                    recipient_ata_quote: recipient_ata_quote.to_account_info(),
                    quote_mint: quote_mint.to_account_info(),
                    associated_token_program: associated_token_program.to_account_info(),
                    token_program: token_program.to_account_info(),
                    system_program: system_program.to_account_info(),
                },
                signer,
            );

            let withdraw_args = pathfinder::instructions::WithdrawArgs {
                amount: to_withdraw,
                shares: 0,
                owner: manager_config.key(),
            };

            if withdraw(withdraw_ctx, withdraw_args).is_ok() {
                return Ok(to_withdraw);
            }
        }

        Ok(0)
    }

    #[inline(never)]
    fn _withdraw_path(
        assets: u64,
        withdraw_queue_index: u8,
        user: &Signer<'info>,
        recipient: &AccountInfo<'info>,
        manager_config: &Account<'info, ManagerVaultConfig>,
        withdraw_queue: &Vec<Pubkey>,
        quote_mint: &Account<'info, Mint>,
        vault_ata_quote: &Account<'info, TokenAccount>,
        recipient_ata_quote: &Account<'info, TokenAccount>,
        market: &Account<'info, Market>,
        lender_shares: &Account<'info, LenderShares>,
        pathfinder_config: &Account<'info, Config>,
        pathfinder_program: &Program<'info, Pathfinder>,
        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
        associated_token_program: &Program<'info, AssociatedToken>,
    ) -> Result<()> {
        let mut assets = assets;

        // Validate the market at the given index matches
        require!(
            (withdraw_queue_index as usize) < withdraw_queue.len()
                && withdraw_queue[withdraw_queue_index as usize] == market.key(),
            ManagerError::MarketNotFound
        );

        let withdrawn = Self::process_market_withdrawal(
            assets,
            user,
            recipient,
            manager_config,
            &market,
            &lender_shares,
            pathfinder_config,
            pathfinder_program,
            vault_ata_quote,
            quote_mint,
            recipient_ata_quote,
            token_program,
            system_program,
            associated_token_program,
        )?;

        if assets != withdrawn {
            return err!(ManagerError::NotEnoughLiquidity);
        };

        Ok(())
    }

    fn _withdrawable(
        total_supply_assets: u64,
        total_borrow_assets: u64,
        supply_assets: u64,
        vault_ata_quote: &Account<'info, TokenAccount>,
    ) -> Result<u64> {
        let available_in_market = total_supply_assets
            .checked_sub(total_borrow_assets)
            .ok_or(ManagerError::MathUnderflow)?;

        // Inside a flashloan callback, liquidity on Morpho Blue may be limited to the singleton's balance.
        let available_liquidity = min_u64(available_in_market, vault_ata_quote.amount);

        return Ok(min_u64(supply_assets, available_liquidity));
    }

    fn _accrued_supply_balance(
        user: &Signer<'info>,
        market: &Account<'info, Market>,
        lender_shares: &Account<'info, LenderShares>,
        pathfinder_config: &Account<'info, Config>,
        pathfinder_program: &Program<'info, Pathfinder>,
    ) -> Result<(u64, u64)> {
        // accrue interest for market
        let accrue_ctx = CpiContext::new(
            pathfinder_program.to_account_info(),
            pathfinder::cpi::accounts::AccrueInterest {
                user: user.to_account_info(),
                market: market.to_account_info(),
                config: pathfinder_config.to_account_info(),
            },
        );

        accrue_interest(accrue_ctx)?;

        let shares = lender_shares.shares;
        let assets = to_assets_down(shares, market.total_deposits as u64, market.total_shares)?;

        Ok((assets, shares))
    }
}
