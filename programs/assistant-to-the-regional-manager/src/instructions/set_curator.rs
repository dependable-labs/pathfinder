use crate::{error::ManagerError, state::*, traits::owner::OwnerProtection};
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetCuratorArgs {
    pub curator: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: SetCuratorArgs)]
pub struct SetCurator<'info> {
    pub user: Signer<'info>,

    // vault
    #[account(
    mut,
    seeds = [
        MANAGER_CONFIG_SEED_PREFIX,
        &manager_config.quote_mint.as_ref(),
        &manager_config.symbol.as_bytes(),
        &manager_config.name.as_bytes(),
    ],
    bump = manager_config.bump,
  )]
    pub manager_config: Box<Account<'info, ManagerVaultConfig>>,
}

impl<'info> OwnerProtection<'info> for SetCurator<'info> {}

impl<'info> SetCurator<'info> {
    pub fn validate(&self, args: &SetCuratorArgs) -> Result<()> {
        self.is_owner(&self.user, &self.manager_config)?;

        require!(
            args.curator != self.manager_config.curator,
            ManagerError::AlreadySet
        );

        Ok(())
    }

    pub fn handle(ctx: Context<SetCurator>, args: SetCuratorArgs) -> Result<()> {
        let SetCurator { manager_config, .. } = ctx.accounts;

        manager_config.curator = args.curator;

        Ok(())
    }
}
