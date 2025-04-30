use anchor_lang::prelude::*;
use crate::{
  state::*,
  traits::owner::OwnerProtection,
  error::ManagerError
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetAllocatorArgs {
  pub allocator: Pubkey,
  pub is_allocator: bool,
}

#[derive(Accounts)]
#[instruction(args: SetAllocatorArgs)]
pub struct SetAllocator<'info> { 
  #[account(mut)]
  pub user: Signer<'info>,

  #[account(
    init_if_needed,
    payer = user,
    space = 8 + std::mem::size_of::<AllocatorState>(),
    seeds = [
        MANAGER_ALLOCATOR_SEED_PREFIX,
        config.key().as_ref(),
        args.allocator.as_ref(),
    ],
    bump,
  )]
  pub allocator: Box<Account<'info, AllocatorState>>,

  // vault
  #[account(
    mut,
    seeds = [
        MANAGER_CONFIG_SEED_PREFIX,
        config.quote_mint.as_ref(),
        config.symbol.as_bytes(),
        config.name.as_bytes(),
    ],
    bump,
  )]
  pub config: Box<Account<'info, ManagerVaultConfig>>,

  pub system_program: Program<'info, System>,
}

impl<'info> OwnerProtection<'info> for SetAllocator<'info> {}

impl<'info> SetAllocator<'info> {

  pub fn validate(&self, args: &SetAllocatorArgs) -> Result<()> {
    require!(
        self.allocator.is_allocator != args.is_allocator,
        ManagerError::AlreadySet
    );

    self.is_owner(&self.user, &self.config)?;

    Ok(())
  }

  pub fn handle(ctx: Context<SetAllocator>, args: SetAllocatorArgs) -> Result<()> {

    let SetAllocator {
      allocator,
      ..
    } = ctx.accounts;

    allocator.is_allocator = args.is_allocator;

    Ok(())
  }
}
