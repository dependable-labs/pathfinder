use crate::error::ManagerError;
use crate::state::ManagerVaultConfig;
use anchor_lang::prelude::*;

pub trait GuardianProtection<'info> {
    fn is_guardian(
        &self,
        user: &Signer,
        config: &Account<'info, ManagerVaultConfig>,
    ) -> Result<()> {
        if config.guardian != Pubkey::default() {
            require!(
                user.key() == config.guardian || user.key() == config.owner,
                ManagerError::UnauthorizedSigner
            );
        }
        Ok(())
    }
}
