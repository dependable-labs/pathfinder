use crate::error::ManagerError;
use crate::state::ManagerVaultConfig;
use anchor_lang::prelude::*;

pub trait OwnerProtection<'info> {
    fn is_owner(&self, user: &Signer, config: &Account<'info, ManagerVaultConfig>) -> Result<()> {
        if config.owner != Pubkey::default() {
            require!(user.key() == config.owner, ManagerError::UnauthorizedSigner);
        }
        Ok(())
    }
}
