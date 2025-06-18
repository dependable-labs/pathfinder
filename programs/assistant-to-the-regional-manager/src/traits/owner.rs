use crate::error::ManagerError;
use crate::state::ManagerVaultConfig;
use anchor_lang::prelude::*;

pub trait OwnerProtection<'info> {
    fn is_owner(&self, user: &Signer, manager_config: &Account<'info, ManagerVaultConfig>) -> Result<()> {
        if manager_config.owner != Pubkey::default() {
            require!(user.key() == manager_config.owner, ManagerError::UnauthorizedSigner);
        }
        Ok(())
    }
}
