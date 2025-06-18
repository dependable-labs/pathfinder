use anchor_lang::prelude::*;
use anchor_spl::token::*;

use crate::error::*;
use crate::state::*;

use crate::traits::allocator::AllocatorProtection;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ReorderWithdrawQueueArgs {
    pub market_ids: Vec<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: ReorderWithdrawQueueArgs)]
pub struct ReorderWithdrawQueue<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [
            MANAGER_ALLOCATOR_SEED_PREFIX,
            &manager_config.key().as_ref(),
            user.key().as_ref(),
        ],
        bump,
    )]
    pub allocator: Option<Account<'info, AllocatorState>>,

    #[account(
        mut,
        seeds = [
            MANAGER_CONFIG_SEED_PREFIX,
            &manager_config.quote_mint.key().as_ref(),
            &manager_config.symbol.as_bytes(),
            &manager_config.name.as_bytes(),
        ],
        bump = manager_config.bump,
    )]
    pub manager_config: Box<Account<'info, ManagerVaultConfig>>,

    // queue are the market accounts from the pathfinder program
    #[account(
        mut,
        seeds = [
            MANAGER_QUEUE_SEED_PREFIX,
            &manager_config.key().as_ref(),
        ],
        bump = queue.bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    #[account(constraint = quote_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> AllocatorProtection<'info> for ReorderWithdrawQueue<'info> {}

impl<'info> ReorderWithdrawQueue<'info> {
    pub fn validate(&self) -> Result<()> {
        self.is_allocator(&self.user, &self.manager_config, self.allocator.as_ref())?;

        Ok(())
    }

    pub fn handle(
        ctx: Context<ReorderWithdrawQueue>,
        args: ReorderWithdrawQueueArgs,
    ) -> Result<()> {
        let ReorderWithdrawQueue { queue, .. } = ctx.accounts;

        let new_length = args.market_ids.len();
        let curr_length = queue.withdraw_queue.len();

        // Create a HashSet of the current queue for fast lookup
        let mut current_markets = std::collections::HashSet::with_capacity(curr_length);
        for &market_id in &queue.withdraw_queue {
            current_markets.insert(market_id);
        }

        // Keep track of seen markets to prevent duplicates
        let mut seen = std::collections::HashSet::with_capacity(new_length);
        let mut new_withdraw_queue = Vec::with_capacity(new_length);

        // Check for duplicates in the new queue and only include markets that exist in the old queue
        for &market_id in &args.market_ids {
            // Check for duplicates
            if !seen.insert(market_id) {
                return err!(ManagerError::DuplicateMarket);
            }

            // Only include markets that exist in the current queue
            if current_markets.contains(&market_id) {
                new_withdraw_queue.push(market_id);
            } else {
                return err!(ManagerError::MarketNotInQueue);
            }
        }

        queue.withdraw_queue = new_withdraw_queue;

        Ok(())
    }
}
