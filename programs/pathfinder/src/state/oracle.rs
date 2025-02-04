use anchor_lang::prelude::*;

#[derive(
  AnchorSerialize, AnchorDeserialize, Clone, Copy, Eq, PartialEq, Debug, Default, Ord, PartialOrd,
)]
pub enum OracleSource {
  #[default]
  PythPull,
  Switchboard,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct Price {
  pub price: u64,
  pub scale: u64,
}

// Base struct that contains common data
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct Oracle {
    pub id: Pubkey,
    pub source: OracleSource,
}