use anchor_spl::{
  token::{Mint, Token},
  metadata::Metadata,
};
use anchor_lang::prelude::*;
use crate::{
  state::*, 
  utils::shares::_create_metadata_account,
  instructions::timelock::check_timelock_bounds,
};
use pathfinder::math::math::zero_floor_sub;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateManagerArgs {
  pub owner: Pubkey,
  pub guardian: Pubkey,
  pub fee_recipient: Pubkey,
  pub skim_recipient: Pubkey,
  pub curator: Pubkey,
  pub timelock: u64,
  pub name: String,
  pub symbol: String,
}

#[derive(Accounts)]
#[instruction(args: CreateManagerArgs)]
pub struct CreateManager<'info> { 
  #[account(mut)]
  pub user: Signer<'info>,

  // vault
  #[account(
    init,
    payer = user,
    space = 8 + std::mem::size_of::<ManagerVaultConfig>(),
    seeds = [
        CONFIG_SEED_PREFIX,
        quote_mint.key().as_ref(),
        &args.symbol.as_bytes(),
        &args.name.as_bytes(),
    ],
    bump,
  )]
  pub config: Box<Account<'info, ManagerVaultConfig>>,

  #[account(
    init,
    payer = user,
    space = 8 + std::mem::size_of::<QueueState>() + (MAX_QUEUE_LENGTH * std::mem::size_of::<Pubkey>() * 2),
    seeds = [
      QUEUE_SEED_PREFIX,
      config.key().as_ref(),
    ],
    bump,
  )]
  pub queue: Box<Account<'info, QueueState>>,

  // Share token mint account
  #[account(
    init,
    payer = user,
    mint::decimals = quote_mint.decimals,  // Match quote token decimals
    mint::authority = config,  // The vault controls minting/burning
    mint::freeze_authority = config,
  )]
  pub shares_mint: Account<'info, Mint>,

  #[account(constraint = quote_mint.is_initialized == true)]
  pub quote_mint: Box<Account<'info, Mint>>,

  /// CHECK: The metadata account for the share token
  #[account(
    mut,
    seeds = [b"metadata", token_metadata_program.key().as_ref(), shares_mint.key().as_ref()],
    bump,
    seeds::program = token_metadata_program.key(),
  )]
  pub metadata_account: AccountInfo<'info>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub token_metadata_program: Program<'info, Metadata>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> CreateManager<'info> {
  pub fn handle(ctx: Context<CreateManager>, args: CreateManagerArgs) -> Result<()> {

    let CreateManager {
      user,
      config,
      metadata_account,
      shares_mint,
      system_program,
      rent,
      token_metadata_program,
      quote_mint,
      queue,
      ..
    } = ctx.accounts;

    check_timelock_bounds(args.timelock)?;

    config.set_inner(ManagerVaultConfig {
        bump: ctx.bumps.config,
        name: args.name,
        symbol: args.symbol,
        quote_mint: quote_mint.key(),
        shares_mint: shares_mint.key(),
        curator: args.curator,
        guardian: args.guardian,
        owner: args.owner,
        pending_guardian: PendingPubkey {
          value: Pubkey::default(),
          valid_at: 0,
        },
        fee_recipient: args.fee_recipient,
        skim_recipient: args.skim_recipient,
        timelock: args.timelock,
        fee: 0,
        decimals_offset: zero_floor_sub(9, quote_mint.decimals as u64) as u8,
        pathfinder_program: PATHFINDER_PROGRAM_ID,  // The PATHFINDER immutable
        last_total_assets: 0,
        pending_timelock: PendingU64 {
          value: 0,
          valid_at: 0,
        },
    });

    queue.set_inner(QueueState {
      bump: ctx.bumps.queue,
      supply_queue: Vec::new(),
      withdraw_queue: Vec::new(),
    });

    // Create the metadata account for the share token
    _create_metadata_account(
      &config.name,
      &config.symbol,
      &config,
      &metadata_account,
      &shares_mint,
      &user,
      &system_program,
      &rent,
      &token_metadata_program,
    )?;


    Ok(())

  }
}


