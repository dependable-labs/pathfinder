use anchor_lang::prelude::*;
use anchor_spl::token::*;
use pathfinder as PATH;

use crate::state::*;
use crate::error::*;

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
            CONFIG_SEED_PREFIX,
            config.quote_mint.as_ref(),
            config.symbol.as_bytes(),
            config.name.as_bytes(),
        ],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ManagerVaultConfig>>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<QueueState>(),
        seeds = [
            QUEUE_SEED_PREFIX,
            config.key().as_ref(),
        ],
        bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<MarketConfig>(),
        seeds = [
            MARKET_CONFIG_SEED_PREFIX,
            config.key().as_ref(),
            args.market_id.as_ref(),
        ],
        bump,
    )]
    pub market_config: Box<Account<'info, MarketConfig>>,

    pub system_program: Program<'info, System>,
}

impl<'info> SubmitCap<'info> {
    pub fn handle(ctx: Context<SubmitCap>, args: SubmitCapArgs) -> Result<()> {
        let SubmitCap {
            market_config,
            queue,
            ..
        } = ctx.accounts;

        let market_id: Pubkey = args.market_id;

        // Check if there's already a pending cap change
        if market_config.pending_cap != 0 {
            return err!(ManagerError::AlreadyPending);
        }

        // Check if market is pending removal
        if market_config.removable_at != 0 {
            return err!(ManagerError::PendingRemoval);
        }

        let current_cap = market_config.cap;
        
        // Check if new cap is same as current
        if args.supply_cap == current_cap {
            return err!(ManagerError::AlreadySet);
        }

        // If reducing cap, set immediately
        if args.supply_cap < current_cap {
            market_config.cap = args.supply_cap;
            set_cap(queue, market_config, market_id, args.supply_cap)?;
        } else {
            // Otherwise set as pending cap
            market_config.pending_cap = args.supply_cap;
        }

        Ok(())
    }
}


pub fn set_cap(
    queue: &mut QueueState,
    market_config: &mut MarketConfig,
    market_id: Pubkey,
    new_cap: u64
) -> Result<()> {

    if new_cap > 0 {
        if !market_config.enabled {
            queue.withdraw_queue.push(market_id);

            if queue.withdraw_queue.len() > MAX_QUEUE_LENGTH {
                return err!(ManagerError::MaxQueueLengthExceeded);
            }

            market_config.enabled = true;

            // Update last total assets without fee
            // TODO: Implement total assets calculation
            // config.last_total_assets += expected_supply_assets;
        }

        market_config.removable_at = 0;
    }

    market_config.cap = new_cap;
    market_config.pending_cap = 0;

    Ok(())
}

