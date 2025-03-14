use anchor_spl::{
  associated_token::AssociatedToken,
  token::{mint_to, Mint, MintTo, Token, TokenAccount},
  metadata::{
      create_metadata_accounts_v3,
      mpl_token_metadata::types::DataV2,
      CreateMetadataAccountsV3, 
      Metadata,
  },
};
use anchor_lang::prelude::*;
use crate::{state::*, generate_manager_vault_seeds};
use crate::instructions::timelock::check_timelock_bounds;
use crate::traits::{owner::OwnerProtection};
use crate::error::ManagerError;

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
        CONFIG_SEED_PREFIX,
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
