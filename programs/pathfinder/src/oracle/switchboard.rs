use anchor_lang::{
  prelude::*,
  ZeroCopy,
};
use arrayref::array_ref;

use switchboard_on_demand::{PullFeedAccountData, ID as SB_ID, SB_ON_DEMAND_PRECISION};
use std::cell::Ref;
use std::mem;

use crate::error::MarketError;
use crate::oracle::OracleSource;
use crate::state::{oracle::{Oracle, Price}, constants::{PRICE_PRECISION, SLOT_IN_MILLISECONDS, HR_MILLISECONDS}};

pub fn oracle_sb_init(source: &OracleSource, oracle_id: &Pubkey) -> Result<Oracle> {
  Ok(Oracle {
    id: oracle_id.clone(),
    source: source.clone(),
  })
}

pub fn load_ref<'a, T: ZeroCopy + Owner>(ai: &'a AccountInfo, oracle_id: &Pubkey) -> Result<Ref<'a, T>> {
  require!(
      ai.owner.eq(&SB_ID),
      MarketError::InvalidOracle
  );

  require!(
      ai.key.eq(oracle_id),
      MarketError::InvalidOracle
  );

  let data = ai.try_borrow_data()?;
  if data.len() < T::discriminator().len() {
      return Err(ErrorCode::AccountDiscriminatorNotFound.into());
  }

  let disc_bytes = array_ref![data, 0, 8];
  if disc_bytes != &T::discriminator() {
      return Err(ErrorCode::AccountDiscriminatorMismatch.into());
  }

  Ok(Ref::map(data, |data| {
      bytemuck::from_bytes(&data[8..mem::size_of::<T>() + 8])
  }))
}

fn convert_sb_i128(switchboard_i128: &i128) -> Result<i128> {
  let switchboard_precision = 10_u128.pow(SB_ON_DEMAND_PRECISION);
  switchboard_i128.checked_div((switchboard_precision / PRICE_PRECISION) as i128)
      .ok_or(error!(MarketError::MathOverflow))
}

pub fn oracle_sb_get_price(
  oracle: &Oracle,
  ai: &AccountInfo
) -> Result<Price> {

  let pull_feed_account_info: Ref<PullFeedAccountData> = 
    load_ref(ai, &oracle.id)?;

  let price_i128 = pull_feed_account_info.result.value().unwrap();
  let price = u64::try_from(convert_sb_i128(&price_i128)?).unwrap();

  let latest_oracle_submssions: Vec<switchboard_on_demand::OracleSubmission> =
      pull_feed_account_info.latest_submissions();

  let delay = Clock::get()?.slot
    .checked_sub(latest_oracle_submssions[0].landed_at)
    .ok_or(error!(MarketError::MathOverflow))?;

  // TODO: Check if this is correct
  require!(
    delay.checked_mul(SLOT_IN_MILLISECONDS)
      .ok_or(error!(MarketError::MathOverflow))? <= HR_MILLISECONDS,
    MarketError::StaleOracle
  );

  Ok(Price {
    price,
    scale: PRICE_PRECISION as u64, // 1e9 scale
  })
}  