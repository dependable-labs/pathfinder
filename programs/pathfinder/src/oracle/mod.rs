use anchor_lang::prelude::*;
use crate::state::oracle::{Oracle, OracleSource, Price};
use crate::oracle::{
  pyth::{oracle_pyth_init, oracle_pyth_get_price},
  switchboard::{oracle_sb_init, oracle_sb_get_price}
};

pub mod pyth;
pub mod switchboard;

// Base trait that defines both the required data and behavior
pub fn oracle_init(source: &OracleSource, oracle_id: &Pubkey) -> Result<Oracle> {
  match source {
    OracleSource::PythPull => Ok(oracle_pyth_init(source, oracle_id)?),
    OracleSource::SwitchboardPull => Ok(oracle_sb_init(source, oracle_id)?),
  }
}

pub fn oracle_get_price(
  oracle: &Oracle,
  ai: &AccountInfo,
  upper_bound: bool) -> Result<Price> {
  match oracle.source {
    OracleSource::PythPull => Ok(oracle_pyth_get_price(oracle, ai, upper_bound)?),
    OracleSource::SwitchboardPull => Ok(oracle_sb_get_price(oracle, ai)?),
  }
}
