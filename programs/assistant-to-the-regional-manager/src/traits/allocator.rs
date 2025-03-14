use crate::error::ManagerError;
use crate::state::ManagerVaultConfig;
use anchor_lang::prelude::*;
use crate::state::AllocatorState;

pub trait AllocatorProtection<'info> {
  fn is_allocator(&self, user: &Signer, config: &Account<'info, ManagerVaultConfig>, allocator: &Account<'info, AllocatorState>) -> Result<()> {

    require!(
        allocator.is_allocator || user.key() == config.curator || user.key() == config.owner,
        ManagerError::UnauthorizedSigner
    );

    Ok(())
  }
}