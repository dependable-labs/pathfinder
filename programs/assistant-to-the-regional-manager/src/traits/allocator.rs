use crate::error::ManagerError;
use crate::state::AllocatorState;
use crate::state::ManagerVaultConfig;
use anchor_lang::prelude::*;

pub trait AllocatorProtection<'info> {
    fn is_allocator(
        &self,
        user: &Signer,
        config: &Account<'info, ManagerVaultConfig>,
        allocator: Option<&Account<'info, AllocatorState>>,
    ) -> Result<()> {
        // Check if user is an owner or curator (has direct permission)
        let has_direct_permission = user.key() == config.curator || user.key() == config.owner;

        // Check if user is operating through a valid allocator account
        let has_allocator_permission = allocator.map(|alloc| alloc.is_allocator).unwrap_or(false);

        // User must have either direct permission or allocator permission
        require!(
            has_direct_permission || has_allocator_permission,
            ManagerError::UnauthorizedSigner
        );

        Ok(())
    }
}
