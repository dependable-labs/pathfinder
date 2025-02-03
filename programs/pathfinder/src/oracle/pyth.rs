use anchor_lang::prelude::*;

use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};

use crate::error::MarketError;
use crate::state::MAX_PRICE_AGE;

use crate::oracle::OracleSource;
use crate::state::oracle::{Oracle, Price};

pub fn oracle_pyth_init(source: &OracleSource, feed_id: &str) -> Result<Oracle> {
  Ok(Oracle {
    feed_id: get_feed_id_from_hex(feed_id)?,
    source: source.clone(),
  })
}

pub fn oracle_pyth_get_price(oracle: &Oracle, pyth_price: &Account<PriceUpdateV2>, upper_bound: bool) -> Result<Price> {
    let clock = Clock::get()?;
    let price_feed = pyth_price.get_price_no_older_than(&clock, MAX_PRICE_AGE, &oracle.feed_id)?;
    
    let price_precision = 10_u64
        .checked_pow(price_feed.exponent.unsigned_abs())
        .ok_or(MarketError::MathOverflow)?;

    let price = price_feed.price as u64;

    let adjusted_price = if upper_bound {
        price
        .checked_add(price_feed.conf as u64)
        .ok_or(MarketError::MathOverflow)?
    } else {
        price
        .checked_sub(price_feed.conf as u64)
        .ok_or(MarketError::MathUnderflow)?
    };

    Ok(Price {
      price: adjusted_price,
      scale: price_precision,
    })
  }  