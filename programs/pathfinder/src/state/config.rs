use anchor_lang::prelude::*;

#[account]
pub struct Config {
  pub bump: u8,
  pub authority: Pubkey,
  pub fee_factor: u64,
  pub fee_recipient: Pubkey,
}