use crate::error::ManagerError;
use crate::state::ManagerVaultConfig;
use anchor_lang::prelude::*;

pub trait CuratorProtection<'info> {
    fn is_curator(&self, user: &Signer, manager_config: &Account<'info, ManagerVaultConfig>) -> Result<()> {
        if manager_config.curator != Pubkey::default() {
            require!(
                user.key() == manager_config.curator || user.key() == manager_config.owner,
                ManagerError::UnauthorizedSigner
            );
        }
        Ok(())
    }
}
