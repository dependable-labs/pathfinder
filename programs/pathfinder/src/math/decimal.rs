//! Math for preserving precision of token amounts which are limited
//! by the SPL Token program to be at most u64::MAX.
//!
//! Decimals are internally scaled by a WAD (10^18) to preserve
//! precision up to 18 decimal places. Decimals are sized to support
//! both serialization and precise math for the full range of
//! unsigned 64-bit integers. The underlying representation is a
//! U256 rather than u256 to reduce compute cost while losing
//! support for arithmetic operations at the high end of u64 range.

#![allow(clippy::assign_op_pattern)]
#![allow(clippy::ptr_offset_with_cast)]
#![allow(clippy::manual_range_contains)]

use anchor_lang::prelude::*;
use crate::math::*;
use std::{convert::TryFrom, fmt};
use crate::error::MarketError;

// U256 with 256 bits consisting of 4 x 64-bit words
mod uint_types {
    use uint::construct_uint;
    construct_uint! {
        pub struct U256(4);
    }
}

pub use uint_types::U256;

/// Large decimal values, precise to 18 digits
#[derive(Clone, Copy, Default, PartialEq, PartialOrd, Eq, Ord)]
pub struct Decimal(pub U256);

impl Decimal {
    /// One
    pub fn one() -> Self {
        Self(Self::wad())
    }

    // OPTIMIZE: use const slice when fixed in BPF toolchain
    fn wad() -> U256 {
        U256::from(WAD)
    }

    /// Create decimal from scaled value
    pub fn from_raw_u128(scaled_val: u128) -> Self {
        Self(U256::from(scaled_val))
    }

    /// Create decimal from scaled value
    pub fn from_raw_i128(scaled_val: i128) -> Self {
        Self(U256::from(scaled_val))
    }

    /// Create decimal from u64 without WAD scaling
    pub fn from_raw_u64(scaled_val: u64) -> Self {
        Self(U256::from(scaled_val))
    }

    pub fn to_u64(&self) -> Result<u64> {
        Ok(u64::try_from(self.0).map_err(|_| MarketError::MathOverflow)?)
    }

    pub fn to_u128(&self) -> Result<u128> {
        Ok(u128::try_from(self.0).map_err(|_| MarketError::MathOverflow)?)
    }
 
    /// Returns (x * y) / WAD rounded down
    pub fn w_mul_down(&self, rhs: Decimal) -> Result<Decimal> {
        Ok(self.mul_div_down(rhs, Decimal::one())?)
    }

    /// Returns (x * WAD) / y rounded down
    pub fn w_div_down(&self, rhs: Decimal) -> Result<Decimal> {
        Ok(self.mul_div_down(Decimal::one(), rhs)?)
    }

    /// Returns (x * WAD) / y rounded up
    pub fn w_div_up(&self, rhs: Decimal) -> Result<Decimal> {
        Ok(self.mul_div_up(Decimal::one(), rhs)?)
    }

    /// Performs multiplication followed by division, rounding down.
    pub fn mul_div_down(&self, b: Decimal, c: Decimal) -> Result<Decimal> {
        // a * b / c
        Ok(Decimal(self.0
            .checked_mul(b.0)
            .ok_or(error!(MarketError::MathOverflow))?
            .checked_div(c.0)
            .ok_or(error!(MarketError::MathOverflow))?))
    }

    pub fn mul_div_up(&self, b: Decimal, c: Decimal) -> Result<Decimal> {
        // (a * b + (c - 1)) / c
        let product = self.0.checked_mul(b.0).ok_or(error!(MarketError::MathOverflow))?;
        let c_minus_one = c.0.checked_sub(U256::from(1u64)).ok_or(error!(MarketError::MathUnderflow))?;
        let numerator = product
            .checked_add(c_minus_one)
            .ok_or(error!(MarketError::MathOverflow))?;

        let result = numerator
            .checked_div(c.0)
            .ok_or(error!(MarketError::MathOverflow))?;

        Ok(Decimal(result))
    }

    pub fn try_add(&self, rhs: Decimal) -> Result<Decimal> {
        Ok(Decimal(
            self.0
                .checked_add(rhs.0)
                .ok_or(MarketError::MathOverflow)?,
        ))
    }

    pub fn try_sub(&self, rhs: Decimal) -> Result<Decimal> {
        Ok(Decimal(
            self.0
                .checked_sub(rhs.0)
                .ok_or(MarketError::MathOverflow)?,
        ))
    }

    pub fn try_mul(&self, rhs: Decimal) -> Result<Decimal> {
        Ok(Decimal(
            self.0
                .checked_mul(rhs.0)
                .ok_or(MarketError::MathOverflow)?
        ))
    }
}

impl fmt::Display for Decimal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut scaled_val = self.0.to_string();
        if scaled_val.len() <= SCALE {
            scaled_val.insert_str(0, &vec!["0"; SCALE - scaled_val.len()].join(""));
            scaled_val.insert_str(0, "0.");
        } else {
            scaled_val.insert(scaled_val.len() - SCALE, '.');
        }
        f.write_str(&scaled_val)
    }
}

impl fmt::Debug for Decimal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self)
    }
}

impl From<u64> for Decimal {
    fn from(val: u64) -> Self {
        Self(Self::wad() * U256::from(val))
    }
}

impl From<u128> for Decimal {
    fn from(val: u128) -> Self {
        Self(Self::wad() * U256::from(val))
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_scaler() {
        assert_eq!(U256::exp10(SCALE), Decimal::wad());
    }

    #[test]
    fn test_u256() {
        let one = U256::from(1);
        assert_eq!(one.0, [1u64, 0, 0, 0]);

        let wad = Decimal::wad();
        assert_eq!(wad.0, [WAD as u64, 0, 0, 0]);

        let hundred = Decimal::from(100u64);
        // 2^64 * 5 + 7766279631452241920 = 1e20
        assert_eq!(hundred.0 .0, [7766279631452241920, 5, 0, 0]);
    }

    #[test]
    fn test_to_scaled_val() {
        assert_eq!(
            Decimal(U256::from(u128::MAX)).to_u128().unwrap(),
            u128::MAX
        );

        assert_eq!(
            Decimal(U256::from(u128::MAX))
                .try_add(Decimal(U256::from(1)))
                .unwrap()
                .to_u128(),
            Err(error!(MarketError::MathOverflow)));
    }

    #[test]
    fn test_display() {
        assert_eq!(Decimal::from(1u64).to_string(), "1.000000000000000000");
        assert_eq!(
            Decimal::from_raw_u128(1u128).to_string(),
            "0.000000000000000001"
        );
    }

}
