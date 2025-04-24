use anchor_lang::prelude::*;
use anchor_spl::token::*;

use crate::state::*;
use crate::error::*;
use crate::utils::accounts::{load_market_config, validate_market_config_pda};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetSupplyQueueArgs {
    pub market_ids: Vec<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: SetSupplyQueueArgs)]
pub struct SetSupplyQueue<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

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

    #[account(constraint = quote_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    // NOTE: remaining accounts are market configs.
    // These are not specified here but are passed in the context
}

impl<'info> SetSupplyQueue<'info> {
    pub fn handle(ctx: Context<SetSupplyQueue>, args: SetSupplyQueueArgs) -> Result<()> {
        let SetSupplyQueue {
          config,
          queue,
          ..
        } = ctx.accounts;

        // Check queue length doesn't exceed max
        if args.market_ids.len() > MAX_QUEUE_LENGTH {
          return err!(ManagerError::MaxQueueLengthExceeded);
        }

        // Verify all markets in queue are authorized
        for (i, path_market_pubkey) in args.market_ids.iter().enumerate() {

          // retreive configs for each market account
          let market_config = load_market_config(&ctx.remaining_accounts[i])?;

          validate_market_config_pda(
            &ctx.remaining_accounts[i],
            &config.key(),
            path_market_pubkey,
          )?;
 
          if market_config.cap == 0 {
            return err!(ManagerError::UnauthorizedMarket);
          }
        }

        // Update supply queue
        queue.supply_queue = args.market_ids;

        Ok(())

    }
}