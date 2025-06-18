use crate::error::ManagerError;
use crate::state::ManagerVaultConfig;
use anchor_lang::prelude::*;

pub trait CuratorOrGuardianProtection<'info> {
    fn is_curator_or_guardian(
        &self,
        user: &Signer,
        manager_config: &Account<'info, ManagerVaultConfig>,
    ) -> Result<()> {
        if manager_config.curator != Pubkey::default() {
            require!(
                user.key() == manager_config.curator
                    || user.key() == manager_config.owner
                    || user.key() == manager_config.guardian,
                ManagerError::UnauthorizedSigner
            );
        }
        Ok(())
    }
}
