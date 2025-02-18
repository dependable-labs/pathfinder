use anchor_lang::prelude::*;

use crate::error::MarketError;
use crate::state::*;
use crate::traits::authority::AuthorityProtection;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateRecipientArgs {
  pub new_recipient: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: UpdateRecipientArgs)]
pub struct UpdateRecipient<'info> {
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

impl<'info> AuthorityProtection<'info> for UpdateRecipient<'info> {}

impl<'info> UpdateRecipient<'info> {
  pub fn validate(&self, args: &UpdateRecipientArgs) -> Result<()> {
    self.is_authority(&self.user, &self.config)?;
    require!(
      args.new_recipient != self.config.fee_recipient && args.new_recipient != Pubkey::default(),
      MarketError::InvalidRecipient
    );

    Ok(())
  }

  pub fn handle(ctx: Context<Self>, args: UpdateRecipientArgs) -> Result<()> {
    let UpdateRecipient { config, .. } = ctx.accounts;

    config.fee_recipient = args.new_recipient;

    Ok(())
  }
}
