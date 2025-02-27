use crate::math::*;
use anchor_lang::prelude::*;

// calculations are safe from overflow as u64::MAX * u64::MAX < u128::MAX

// Calculates the value of `assets` quoted in shares, rounding down.
pub fn to_shares_down(deposits: u64, total_deposits: u64, total_shares: u64) -> Result<u64> {
  if total_deposits == 0 {
    return Ok(deposits);
  }
  let result = Decimal::from_raw_u64(deposits)
    .mul_div_down(
      Decimal::from_raw_u64(total_shares),
      Decimal::from_raw_u64(total_deposits),
    )?
    .to_u64()?;

  Ok(result)
}

// Calculates the value of `shares` quoted in assets, rounding down.
pub fn to_assets_down(shares: u64, total_deposits: u64, total_shares: u64) -> Result<u64> {
  if total_shares == 0 {
    return Ok(shares);
  }
  let result = Decimal::from_raw_u64(shares)
    .mul_div_down(
      Decimal::from_raw_u64(total_deposits),
      Decimal::from_raw_u64(total_shares),
    )?
    .to_u64()?;

  Ok(result)
}

pub fn to_shares_up(deposits: u64, total_deposits: u64, total_shares: u64) -> Result<u64> {
  if total_deposits == 0 {
    return Ok(deposits);
  }
  let result = Decimal::from_raw_u64(deposits)
    .mul_div_up(
      Decimal::from_raw_u64(total_shares),
      Decimal::from_raw_u64(total_deposits),
    )?
    .to_u64()?;

  Ok(result)
}

pub fn to_assets_up(shares: u64, total_deposits: u64, total_shares: u64) -> Result<u64> {
  if total_shares == 0 {
    return Ok(shares);
  }
  let result = Decimal::from_raw_u64(shares)
    .mul_div_up(
      Decimal::from_raw_u64(total_deposits),
      Decimal::from_raw_u64(total_shares),
    )?
    .to_u64()?;

  Ok(result)
}
