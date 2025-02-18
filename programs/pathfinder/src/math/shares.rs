use crate::math::*;
use anchor_lang::prelude::*;

// Calculates the value of `assets` quoted in shares, rounding down.
pub fn to_shares_down(deposits: u64, total_deposits: u64, total_shares: u64) -> Result<u64> {
  if total_deposits == 0 {
    return Ok(deposits);
  }
  mul_div_down(
    deposits as u128,
    total_shares as u128,
    total_deposits as u128,
  )
}

// Calculates the value of `shares` quoted in assets, rounding down.
pub fn to_assets_down(shares: u64, total_deposits: u64, total_shares: u64) -> Result<u64> {
  if total_shares == 0 {
    return Ok(shares);
  }
  mul_div_down(shares as u128, total_deposits as u128, total_shares as u128)
}

// Calculates the value of `assets` quoted in shares, rounding up.
pub fn to_shares_up(deposits: u64, total_deposits: u64, total_shares: u64) -> Result<u64> {
  if total_deposits == 0 {
    return Ok(deposits);
  }
  mul_div_up(
    deposits as u128,
    total_shares as u128,
    total_deposits as u128,
  )
}

// Calculates the value of `shares` quoted in assets, rounding up.
pub fn to_assets_up(shares: u64, total_deposits: u64, total_shares: u64) -> Result<u64> {
  if total_shares == 0 {
    return Ok(shares);
  }
  mul_div_up(shares as u128, total_deposits as u128, total_shares as u128)
}
