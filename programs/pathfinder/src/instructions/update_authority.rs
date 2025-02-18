use anchor_lang::prelude::*;

use crate::error::MarketError;
use crate::state::*;
use crate::traits::authority::AuthorityProtection;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateAuthorityArgs {
  pub new_authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: UpdateAuthorityArgs)]
pub struct UpdateAuthority<'info> {
  #[account(mut)]
  pub user: Signer<'info>,

  #[account(
    init_if_needed,
    payer = user,
    space = 8 + std::mem::size_of::<Config>(),
    seeds = [CONFIG_SEED_PREFIX],
    bump,
  )]
  pub config: Box<Account<'info, Config>>,
  pub system_program: Program<'info, System>,
}

impl<'info> AuthorityProtection<'info> for UpdateAuthority<'info> {}

impl<'info> UpdateAuthority<'info> {
  pub fn validate(&self, args: &UpdateAuthorityArgs) -> Result<()> {
    self.is_authority(&self.user, &self.config)?;
    require!(
      args.new_authority != Pubkey::default(),
      MarketError::InvalidAuthority
    );
    require!(
      args.new_authority != self.config.authority,
      MarketError::InvalidAuthority
    );

    Ok(())
  }

  pub fn handle(ctx: Context<Self>, args: UpdateAuthorityArgs) -> Result<()> {
    let UpdateAuthority { config, .. } = ctx.accounts;

    config.authority = args.new_authority;

    Ok(())
  }
}
