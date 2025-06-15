use anchor_lang::prelude::*;
use pathfinder::{
    cpi::{view_expected_supply_assets, init_lender_shares},
    state::{Market, Config},
    program::Pathfinder,
    instructions::{views::supply_balances::ViewMarketWithLenderSharesArgs, init_lender_shares::InitLenderSharesArgs},
};

use crate::error::*;
use crate::state::*;
use crate::traits::curator::CuratorProtection;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SubmitCapArgs {
    pub market_id: Pubkey,
    pub supply_cap: u64,
}

#[derive(Accounts)]
#[instruction(args: SubmitCapArgs)]
pub struct SubmitCap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [
            MANAGER_CONFIG_SEED_PREFIX,
            config.quote_mint.as_ref(),
            config.symbol.as_bytes(),
            config.name.as_bytes(),
        ],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ManagerVaultConfig>>,

    #[account(
        mut,
        seeds = [
            MANAGER_QUEUE_SEED_PREFIX,
            config.key().as_ref(),
        ],
        bump = queue.bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<ManagerMarketConfig>(),
        seeds = [
            MANAGER_MARKET_CONFIG_SEED_PREFIX,
            config.key().as_ref(),
            args.market_id.as_ref(),
        ],
        bump,
    )]
    pub manager_market_config: Box<Account<'info, ManagerMarketConfig>>,

    // pathfinder accounts
    #[account(
        owner = PATHFINDER_PROGRAM_ID,
    )]
    pub market: Account<'info, Market>,
    /// CHECK: could be unintialized checked in Pathfinder::expected_supply_assets
    #[account(mut)]
    pub lender_shares: AccountInfo<'info>,
    pub pathfinder_config: Account<'info, Config>,
    pub pathfinder_program: Program<'info, Pathfinder>,

    pub system_program: Program<'info, System>,
}

impl<'info> CuratorProtection<'info> for SubmitCap<'info> {}

impl<'info> SubmitCap<'info> {
    pub fn validate(&self, args: &SubmitCapArgs) -> Result<()> {
        self.is_curator(&self.user, &self.config)?;
        Ok(())
    }

    pub fn handle(ctx: Context<SubmitCap>, args: SubmitCapArgs) -> Result<()> {
        let SubmitCap {
            user,
            manager_market_config,
            config,
            market,
            queue,
            lender_shares,
            pathfinder_config,
            pathfinder_program,
            system_program,
            ..
        } = ctx.accounts;

        let market_id: Pubkey = market.key();

        // Check if there's already a pending cap change
        if manager_market_config.pending_cap.valid_at != 0 {
            return err!(ManagerError::AlreadyPending);
        }

        // Check if market is pending removal
        if manager_market_config.removable_at != 0 {
            return err!(ManagerError::PendingRemoval);
        }

        let current_cap = manager_market_config.cap;

        // Check if new cap is same as current
        if args.supply_cap == current_cap {
            return err!(ManagerError::AlreadySet);
        }

        // assume lender_shares is not initialized
        if lender_shares.data_is_empty() {
            let init_lender_shares_ctx = CpiContext::new(
                pathfinder_program.to_account_info(),
                pathfinder::cpi::accounts::InitLenderShares {
                    user: user.to_account_info(),
                    market: market.to_account_info(),
                    config: pathfinder_config.to_account_info(),
                    lender_shares: lender_shares.to_account_info(),
                    system_program: system_program.to_account_info(),
                },
            );
            // performs seed & ownership validation
            init_lender_shares(init_lender_shares_ctx, InitLenderSharesArgs {
                owner: config.key(),
            })?;
        }

       // If reducing cap, set immediately
        if args.supply_cap < current_cap {
            manager_market_config.cap = args.supply_cap;
            set_cap(
                args.supply_cap,
                market_id,
                queue,
                manager_market_config,
                config,
                market,
                lender_shares,
                pathfinder_config,
                pathfinder_program,
            )?;
        } else {
            // Otherwise set as pending cap
            manager_market_config
                .pending_cap
                .update(args.supply_cap, config.timelock)?;
        }

        Ok(())
    }
}

pub fn set_cap<'info>(
    new_cap: u64,
    market_id: Pubkey,
    queue: &mut QueueState,
    manager_market_config: &mut Account<'info, ManagerMarketConfig>,
    manager_config: &mut Account<'info, ManagerVaultConfig>,
    market: &Account<'info, Market>,
    lender_shares: &AccountInfo<'info>,
    pathfinder_config: &Account<'info, Config>,
    pathfinder_program: &Program<'info, Pathfinder>,
) -> Result<()> {

    if new_cap > 0 {
        if !manager_market_config.enabled {
            queue.withdraw_queue.push(market_id);

            if queue.withdraw_queue.len() > MAX_QUEUE_LENGTH {
                return err!(ManagerError::MaxQueueLengthExceeded);
            }

            manager_market_config.enabled = true;

            let view_market_ctx = CpiContext::new(
                pathfinder_program.to_account_info(),
                pathfinder::cpi::accounts::ViewMarketWithLenderShares {
                    market: market.to_account_info(),
                    config: pathfinder_config.to_account_info(),
                    lender_shares: lender_shares.to_account_info(),
                },
            );

            // Update last total assets without fee
            // performs seed & ownership validation of lender_shares
            let expected_assets =
                view_expected_supply_assets(view_market_ctx, ViewMarketWithLenderSharesArgs {
                    owner: manager_config.key(),
                })?;

            manager_config.last_total_assets = manager_config
                .last_total_assets
                .checked_add(expected_assets.get())
                .ok_or(ManagerError::MathOverflow)?;
        }

        manager_market_config.removable_at = 0;
    }

    manager_market_config.cap = new_cap;
    manager_market_config.pending_cap = PendingU64 {
        value: 0,
        valid_at: 0,
    };

    Ok(())
}
