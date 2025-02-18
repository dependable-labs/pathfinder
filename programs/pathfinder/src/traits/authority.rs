use crate::error::MarketError;
use crate::state::Config;
use anchor_lang::prelude::*;

pub trait AuthorityProtection<'info> {
  fn is_authority(&self, user: &Signer, config: &Account<'info, Config>) -> Result<()> {
    if config.authority != Pubkey::default() {
      require!(
        user.key() == config.authority,
        MarketError::InvalidAuthority
      );
    }
    Ok(())
  }
}
