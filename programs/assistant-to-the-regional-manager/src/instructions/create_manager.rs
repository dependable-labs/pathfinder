use anchor_spl::{
  token::*,
  associated_token::AssociatedToken,
};
use anchor_lang::prelude::*;
use crate::{
  state::*, 
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
        MANAGER_CONFIG_SEED_PREFIX,
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
      MANAGER_QUEUE_SEED_PREFIX,
      config.key().as_ref(),
    ],
    bump,
  )]
  pub queue: Box<Account<'info, QueueState>>,

  #[account(
      init,
      payer = user,
      space = 8 + std::mem::size_of::<SupplyShares>(),
      seeds = [
          MANAGER_SHARES_SEED_PREFIX,
          config.key().as_ref(),
          args.fee_recipient.key().as_ref()
      ],
      bump
  )]
  pub fee_recipient_shares: Box<Account<'info, SupplyShares>>,

  #[account(
      init,
      payer = user,
      associated_token::authority = config,
      associated_token::mint = quote_mint,
  )]
  pub manager_ata_quote: Account<'info, TokenAccount>,

  #[account(constraint = quote_mint.is_initialized == true)]
  pub quote_mint: Box<Account<'info, Mint>>,

  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> CreateManager<'info> {
  pub fn handle(ctx: Context<CreateManager>, args: CreateManagerArgs) -> Result<()> {

    let CreateManager {
      config,
      quote_mint,
      queue,
      fee_recipient_shares,
      ..
    } = ctx.accounts;

    check_timelock_bounds(args.timelock)?;

    config.set_inner(ManagerVaultConfig {
        bump: ctx.bumps.config,
        name: args.name,
        symbol: args.symbol,
        quote_mint: quote_mint.key(),
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
        total_shares: 0,
    });

    queue.set_inner(QueueState {
      bump: ctx.bumps.queue,
      supply_queue: Vec::with_capacity(MAX_QUEUE_LENGTH),
      withdraw_queue: Vec::with_capacity(MAX_QUEUE_LENGTH),
    });

    fee_recipient_shares.set_inner(SupplyShares {
      bump: ctx.bumps.fee_recipient_shares,
      shares: 0,
    });

    Ok(())

  }
}


