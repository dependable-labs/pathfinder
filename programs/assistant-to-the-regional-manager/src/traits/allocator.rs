use crate::error::ManagerError;
use crate::state::ManagerVaultConfig;
use anchor_lang::prelude::*;

pub trait AllocatorProtection<'info> {
  fn is_allocator(&self, user: &Signer, config: &Account<'info, ManagerVaultConfig>) -> Result<()> {
    if config.allocator != Pubkey::default() {
      require!(
        user.key() == config.allocator,
        ManagerError::UnauthorizedSigner
      );
    }
    Ok(())
  }
}