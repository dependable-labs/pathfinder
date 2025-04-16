use anchor_lang::prelude::*;
use anchor_spl::token::*;
use pathfinder::state::LenderShares;

use crate::state::*;
use crate::error::*;

use crate::traits::allocator::AllocatorProtection;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RemoveFromWithdrawQueueArgs {
    pub market_id: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: RemoveFromWithdrawQueueArgs)]
pub struct RemoveFromWithdrawQueue<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(  
        seeds = [
            ALLOCATOR_SEED_PREFIX,
            config.key().as_ref(),
            user.key().as_ref(),
        ],
        bump,
    )]
    pub allocator: Option<Account<'info, AllocatorState>>,

    #[account(
        mut,
        seeds = [
            CONFIG_SEED_PREFIX,
            quote_mint.key().as_ref(),
            config.symbol.as_bytes(),
            config.name.as_bytes(),
        ],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ManagerVaultConfig>>,

    #[account(
        mut,
        seeds = [
            MARKET_CONFIG_SEED_PREFIX,
            config.key().as_ref(),
            args.market_id.as_ref(),
        ],
        bump,
    )]
    pub market_config: Box<Account<'info, MarketConfig>>,

    // queue are the market accounts from the pathfinder program
    #[account(
        mut,
        seeds = [
            QUEUE_SEED_PREFIX,
            config.key().as_ref(),
        ],
        bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    // TODO: if I can't derive this account since its owned by pathfinder
    // how do I ensure this is the right lender_shares account?
    pub lender_shares: Option<Account<'info, LenderShares>>,

    #[account(constraint = quote_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> AllocatorProtection<'info> for RemoveFromWithdrawQueue<'info> {}

impl<'info> RemoveFromWithdrawQueue<'info> {

  pub fn validate(&self) -> Result<()> {
    self.is_allocator(&self.user, &self.config, self.allocator.as_ref())?;

    Ok(())
  }

  pub fn handle(ctx: Context<RemoveFromWithdrawQueue>, args: RemoveFromWithdrawQueueArgs) -> Result<()> {
    let RemoveFromWithdrawQueue {
      queue,
      market_config,
      lender_shares,
      ..
    } = ctx.accounts;

    // Find position of market to remove
    for i in 0..queue.withdraw_queue.len() {
      let curr_market_id = queue.withdraw_queue[i];

      if curr_market_id == args.market_id {

        if market_config.cap != 0 {
          return err!(ManagerError::InvalidMarketRemovalNonZeroCap);
        }

        if market_config.pending_cap.valid_at != 0 {
          return err!(ManagerError::PendingCap);
        }

        // Check if manager has position in market
        if lender_shares.is_some() && lender_shares.as_ref().unwrap().shares != 0 {
          if market_config.removable_at == 0 {
              return err!(ManagerError::InvalidMarketRemovalNonZeroSupply);
          }

          let current_time = Clock::get()?.unix_timestamp as u64;
          if current_time < market_config.removable_at {
              return err!(ManagerError::InvalidMarketRemovalTimelockNotElapsed);
          }
        }

        // clear market config
        market_config.cap = 0;

        // remove the item from the queue
        queue.withdraw_queue.remove(i);

        return Ok(());
      }
    }

    // If we exit the loop without finding the market, it's not in the queue
    return err!(ManagerError::MarketNotInQueue);
  }
}
