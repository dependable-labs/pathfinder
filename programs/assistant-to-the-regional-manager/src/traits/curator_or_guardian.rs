use crate::error::ManagerError;
use crate::state::ManagerVaultConfig;
use anchor_lang::prelude::*;

pub trait CuratorOrGuardianProtection<'info> {
    fn is_curator_or_guardian(
        &self,
        user: &Signer,
        config: &Account<'info, ManagerVaultConfig>,
    ) -> Result<()> {
        if config.curator != Pubkey::default() {
            require!(
                user.key() == config.curator
                    || user.key() == config.owner
                    || user.key() == config.guardian,
                ManagerError::UnauthorizedSigner
            );
        }
        Ok(())
    }
}
