use anchor_lang::prelude::*;

use pyth_solana_receiver_sdk::price_update::{FeedId, PriceUpdateV2, get_feed_id_from_hex};

use crate::error::MarketError;
use crate::state::HR_SECONDS;

use crate::oracle::OracleSource;
use crate::state::oracle::{Oracle, Price};

pub fn oracle_pyth_init(source: &OracleSource, oracle_id: &Pubkey) -> Result<Oracle> {
  Ok(Oracle {
    id: oracle_id.clone(),
    source: source.clone(),
  })
}

pub fn load_price_update_v2_checked(ai: &AccountInfo) -> Result<PriceUpdateV2> {
  require!(
    ai.owner.eq(&pyth_solana_receiver_sdk::id()),
    MarketError::InvalidOracle
  );

  let price_feed_data = ai.try_borrow_data()?;
  let discriminator = &price_feed_data[0..8];

  require!(
    discriminator == <PriceUpdateV2 as anchor_lang::Discriminator>::DISCRIMINATOR,
    MarketError::InvalidOracle
  );

  Ok(PriceUpdateV2::deserialize(
      &mut &price_feed_data.as_ref()[8..],
  )?)
}

pub fn oracle_pyth_feed_id(oracle_id: &Pubkey) -> Result<FeedId> {
    Ok(oracle_id.to_bytes())
}

pub fn oracle_pyth_get_price(
  oracle: &Oracle,
  ai: &AccountInfo,
  upper_bound: bool) -> Result<Price> {

  let feed_id = oracle_pyth_feed_id(&oracle.id)?;

  let price_update = load_price_update_v2_checked(ai)?;

  let clock = Clock::get()?;
  let price_feed = price_update.get_price_no_older_than(&clock, HR_SECONDS, &feed_id)?;
  
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