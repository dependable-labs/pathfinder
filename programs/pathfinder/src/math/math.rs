use crate::error::MarketError;
use anchor_lang::prelude::*;
use crate::math::*;

pub const WAD: u128 = 1_000_000_000_000_000_000; // 1e18
pub const WAD_INT: i128 = 1_000_000_000_000_000_000; // 1e18

/// Scale of precision
pub const SCALE: usize = 18;

/// Half of identity
pub const HALF_WAD: u64 = 500_000_000_000_000_000;
/// Scale for percentages
pub const PERCENT_SCALER: u64 = 10_000_000_000_000_000;
/// Scale for basis points
pub const BPS_SCALER: u64 = 100_000_000_000_000;

/// Returns (x * y) / WAD rounded down
pub fn w_mul_down(x: u64, y: u64) -> Result<u64> {
  mul_div_down(x as u128, y as u128, WAD)
}

/// Returns (x * WAD) / y rounded down
pub fn w_div_down(x: u64, y: u64) -> Result<u64> {
  mul_div_down(x as u128, WAD, y as u128)
}

/// Returns (x * WAD) / y rounded up
pub fn w_div_up(x: u64, y: u64) -> Result<u64> {
  mul_div_up(x as u128, WAD, y as u128)
}

/// Performs multiplication followed by division, rounding down.
pub fn mul_div_down(a: u128, b: u128, c: u128) -> Result<u64> {
  // a * b / c
  let result = a
    .checked_mul(b)
    .ok_or(error!(MarketError::MathOverflow))?
    .checked_div(c)
    .ok_or(error!(MarketError::MathOverflow))?;

  u128_to_u64(result)
}

/// Performs multiplication followed by division, rounding up.
pub fn mul_div_up(a: u128, b: u128, c: u128) -> Result<u64> {
  // (a * b + (c - 1)) / c
  let product = a.checked_mul(b).ok_or(error!(MarketError::MathOverflow))?;
  let c_minus_one = c.checked_sub(1).ok_or(error!(MarketError::MathUnderflow))?;
  let numerator = product
    .checked_add(c_minus_one)
    .ok_or(error!(MarketError::MathOverflow))?;
  let result = numerator
    .checked_div(c)
    .ok_or(error!(MarketError::MathOverflow))?;

  u128_to_u64(result)
}

pub fn u128_to_u64(value: u128) -> Result<u64> {
  Ok((value & u64::MAX as u128) as u64)
}

/// Returns the multiplication of `x` by `y` (in WAD) rounded towards 0.
pub fn w_mul_to_zero(x: i128, y: i128) -> Result<i128> {
  x.checked_mul(y)
    .ok_or(error!(MarketError::MathOverflow))?
    .checked_div(WAD_INT)
    .ok_or(error!(MarketError::MathOverflow))
}

/// Returns the division of `x` by `y` (in WAD) rounded towards 0.
pub fn w_div_to_zero(x: i128, y: i128) -> Result<i128> {
  x.checked_mul(WAD_INT)
    .ok_or(error!(MarketError::MathOverflow))?
    .checked_div(y)
    .ok_or(error!(MarketError::MathOverflow))
}

/// Bounds `value` between `min` and `max`.
/// Assumes that `min` <= `max`. If it is not the case it returns `min`.
pub fn bound(value: i128, min: i128, max: i128) -> Result<i128> {
  // First bound value to max
  let mut result = if value > max { max } else { value };

  // Then bound result to min
  result = if result < min { min } else { result };

  Ok(result)
}

/// Returns the sum of the first three non-zero terms of a Taylor expansion of e^(nx) - 1, to approximate a
/// continuous compound interest rate.
pub fn w_taylor_compounded(x: Decimal, n: Decimal) -> Result<Decimal> {
  let first_term = x.try_mul(n)?;
  let second_term = first_term.mul_div_down(first_term, Decimal::from(2u64))?;
  let third_term = second_term.mul_div_down(first_term, Decimal::from(3u64))?;

  let sum = first_term
    .try_add(second_term)?
    .try_add(third_term)?;

  Ok(sum)
}