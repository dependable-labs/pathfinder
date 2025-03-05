use anchor_lang::prelude::*;
use anchor_spl::token::*;

use crate::state::*;
use crate::error::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetSupplyQueueArgs {
    pub new_supply_queue: Vec<Pubkey>,
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
        if args.new_supply_queue.len() > MAX_QUEUE_LENGTH {
          return err!(ManagerError::MaxQueueLengthExceeded);
        }

        // Verify all markets in queue are authorized
        for (i, market_pubkey) in args.new_supply_queue.iter().enumerate() {
          msg!("market_pubkey: {}", &market_pubkey.to_string());
          msg!("market_config i : {}", &ctx.remaining_accounts[i].key().to_string());

          // retreive configs for each market account
          let market_config = load_market_config_checked(&ctx.remaining_accounts[i])?;
          // Derive the expected market config PDA to check cap
          // let config_key = config.key();
          // let seeds = &[
          //     MARKET_CONFIG_SEED_PREFIX,
          //     config_key.as_ref(),
          //     market_pubkey.as_ref(),
          // ];
          // // msg!(MARKET_CONFIG_SEED_PREFIX);
          // msg!("config_key: {}", &config_key.to_string());
          // msg!("market_pubkey: {}", &market_pubkey.to_string());

          // let (expected_market_config_pda, expected_bump) = Pubkey::find_program_address(seeds, ctx.program_id);

          // msg!("expected_market_config_pda: {}", expected_market_config_pda);

          // Verify the account we received matches the expected PDA
          // if ctx.remaining_accounts[i].key() != expected_market_config_pda {
          //   return err!(ManagerError::InvalidMarketConfig);
          // }

          // // If you need to verify the bump stored in the account matches
          // if market_config.bump != expected_bump {
          //   return err!(ManagerError::InvalidMarketConfig);
          // }
          
          // if market_config.cap == 0 {
          //   return err!(ManagerError::UnauthorizedMarket); 
          // }
        }

        // // Update supply queue
        // queue.supply_queue = args.new_supply_queue;

        Ok(())

    }
}


pub fn load_market_config_checked(ai: &AccountInfo) -> Result<MarketConfig> {
  // TODO: Is there away to use Account::<MarketConfig>::try_from()?; 
  // rather then doing these checks manually?

  // market config acc must be initialized to be added to the queue
  require!(
    ai.owner.eq(&crate::ID),
    ManagerError::InvalidMarketConfig
  );

  let market_config_data = ai.try_borrow_data()?;
  // let discriminator = &market_config_data[0..8];

  // require!(
  //   discriminator == <MarketConfig as anchor_lang::Discriminator>::DISCRIMINATOR,
  //   ManagerError::InvalidMarketConfig
  // );

  Ok(MarketConfig::deserialize(
      &mut &market_config_data.as_ref()[8..],
  )?)
}

#[event]
pub struct SetSupplyQueueEvent {
    pub curator: Pubkey,
    pub new_supply_queue: Vec<Pubkey>,
}
