use anchor_lang::prelude::*;
use crate::{state::*, traits::owner::OwnerProtection, error::ManagerError};

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
        config.quote_mint.as_ref(),
        config.symbol.as_bytes(),
        config.name.as_bytes(),
    ],
    bump,
  )]
  pub config: Box<Account<'info, ManagerVaultConfig>>,
}

impl<'info> OwnerProtection<'info> for SetCurator<'info> {}

impl<'info> SetCurator<'info> {

  pub fn validate(&self, args: &SetCuratorArgs) -> Result<()> {
    self.is_owner(&self.user, &self.config)?;

    require!(args.curator != self.config.curator, ManagerError::AlreadySet);

    Ok(())
  }

  pub fn handle(ctx: Context<SetCurator>, args: SetCuratorArgs) -> Result<()> {

    let SetCurator {
      config,
      ..
    } = ctx.accounts;

    config.curator = args.curator;

    Ok(())
  }
}
