use crate::error::ManagerError;
use crate::state::ManagerVaultConfig;
use anchor_lang::prelude::*;

pub trait CuratorProtection<'info> {
  fn is_curator(&self, user: &Signer, config: &Account<'info, ManagerVaultConfig>) -> Result<()> {
    if config.curator != Pubkey::default() {
      require!(
        user.key() == config.curator || user.key() == config.owner,
        ManagerError::UnauthorizedSigner
      );
    }
    Ok(())
  }
}