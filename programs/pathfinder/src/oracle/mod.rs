use anchor_lang::prelude::*;
use crate::error::MarketError;
use crate::state::oracle::{Oracle, OracleSource, Price};
use crate::oracle::pyth::{oracle_pyth_init, oracle_pyth_get_price};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

pub mod pyth;

// Base trait that defines both the required data and behavior
pub fn oracle_init(source: &OracleSource, feed_id: &str) -> Result<Oracle> {
  match source {
    OracleSource::PythPull => Ok(oracle_pyth_init(source, feed_id)?),
    OracleSource::Switchboard => Err(error!(MarketError::UnsupportedOracle)),
  }
}

pub fn oracle_get_price(oracle: &Oracle, price_feed: &Account<PriceUpdateV2>, upper_bound: bool) -> Result<Price> {
  match oracle.source {
    OracleSource::PythPull => Ok(oracle_pyth_get_price(oracle, price_feed, upper_bound)?),
    OracleSource::Switchboard => Err(error!(MarketError::UnsupportedOracle)),
  }
}
