use anchor_lang::prelude::*;
use anchor_spl::token::*;

use crate::state::*;
use crate::error::*;

use pathfinder::{
  cpi::{
    init_lender_shares,
    accounts::InitLenderShares
  },
  state::{Market, LenderShares, Config, MARKET_SHARES_SEED_PREFIX, MARKET_SEED_PREFIX},
  instructions::views::supply_balances::{validate_lender_shares, get_lender_shares_data},
  program::Pathfinder,
};

use crate::traits::allocator::AllocatorProtection;

use pathfinder::instructions::init_lender_shares::*;

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
            MANAGER_ALLOCATOR_SEED_PREFIX,
            manager_config.key().as_ref(),
            user.key().as_ref(),
        ],
        bump,
    )]
    pub allocator: Option<Account<'info, AllocatorState>>,

    #[account(
        mut,
        seeds = [
            MANAGER_CONFIG_SEED_PREFIX,
            &quote_mint.key().as_ref(),
            &manager_config.symbol.as_bytes(),
            &manager_config.name.as_bytes(),
        ],
        bump = manager_config.bump,
    )]
    pub manager_config: Box<Account<'info, ManagerVaultConfig>>,

    #[account(
        mut,
        seeds = [
            MANAGER_MARKET_CONFIG_SEED_PREFIX,
            &manager_config.key().as_ref(),
            &args.market_id.as_ref(),
        ],
        bump,
    )]
    pub manager_market_config: Box<Account<'info, ManagerMarketConfig>>,

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

    #[account(
      mut,
      seeds = [
        MARKET_SHARES_SEED_PREFIX,
        &pathfinder_market.key().as_ref(),
        &manager_config.key().as_ref(),
      ],
      bump,
      seeds::program = pathfinder_program.key(),
    )]
    pub lender_shares: Box<Account<'info, LenderShares>>,

    #[account(
      mut,
      seeds = [
        MARKET_SEED_PREFIX,
        &pathfinder_market.quote_mint.key().as_ref(),
        &pathfinder_market.collateral_mint.key().as_ref(),
        &pathfinder_market.ltv_factor.to_le_bytes(),
        &pathfinder_market.oracle.id.to_bytes(),
      ],
      bump = pathfinder_market.bump,
      seeds::program = pathfinder_program.key(),
    )]
    pub pathfinder_market: Account<'info, Market>,
    pub pathfinder_config: Box<Account<'info, Config>>,
    pub pathfinder_program: Program<'info, Pathfinder>,

    #[account(constraint = quote_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> AllocatorProtection<'info> for RemoveFromWithdrawQueue<'info> {}

impl<'info> RemoveFromWithdrawQueue<'info> {

  pub fn validate(&self) -> Result<()> {
    self.is_allocator(&self.user, &self.manager_config, self.allocator.as_ref())?;

    Ok(())
  }

  pub fn handle(ctx: Context<RemoveFromWithdrawQueue>, args: RemoveFromWithdrawQueueArgs) -> Result<()> {
    let accounts = ctx.accounts;
    
    // Find and validate market position
    let market_index = Self::find_market_in_queue(&accounts.queue, &args.market_id)?;
    
    // Validate market removal conditions
    Self::validate_market_removal_conditions(&accounts.manager_market_config)?;
     
    // Validate position removal conditions
    Self::validate_position_removal_conditions(&accounts.manager_market_config, accounts.lender_shares.shares)?;

    // remove from queue 
    accounts.manager_market_config.cap = 0; 
    accounts.manager_market_config.removable_at = 0;
    accounts.manager_market_config.enabled = false;
    accounts.queue.withdraw_queue.remove(market_index);
    
    Ok(())
  }

  fn find_market_in_queue(queue: &QueueState, market_id: &Pubkey) -> Result<usize> {
    queue.withdraw_queue
      .iter()
      .position(|&id| id == *market_id)
      .ok_or_else(|| error!(ManagerError::MarketNotInQueue))
  }

  fn validate_market_removal_conditions(market_config: &ManagerMarketConfig) -> Result<()> {
    require!(market_config.cap == 0, ManagerError::InvalidMarketRemovalNonZeroCap);
    require!(market_config.pending_cap.valid_at == 0, ManagerError::PendingCap);
    Ok(())
  }

  // fn initialize_lender_shares(accounts: &RemoveFromWithdrawQueue) -> Result<()> {
  //   let cpi_ctx = CpiContext::new(
  //     accounts.pathfinder_program.to_account_info(),
  //     InitLenderShares {
  //       user: accounts.user.to_account_info(),
  //       config: accounts.pathfinder_config.to_account_info(),
  //       market: accounts.pathfinder_market.to_account_info(),
  //       lender_shares: accounts.lender_shares.to_account_info(),
  //       system_program: accounts.system_program.to_account_info(),
  //     }
  //   );

  //   init_lender_shares(cpi_ctx, InitLenderSharesArgs {
  //     owner: accounts.manager_config.key()
  //   })
  // }


  fn validate_position_removal_conditions(
    manager_market_config: &ManagerMarketConfig, 
    shares: u64
  ) -> Result<()> {
    if shares != 0 {
      require!(manager_market_config.removable_at != 0, ManagerError::InvalidMarketRemovalNonZeroSupply);
      
      let current_time = Clock::get()?.unix_timestamp as u64;
      require!(
        current_time >= manager_market_config.removable_at, 
        ManagerError::InvalidMarketRemovalTimelockNotElapsed
      );
    }
    Ok(())
  }
}
