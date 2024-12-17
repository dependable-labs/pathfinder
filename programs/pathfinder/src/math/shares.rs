use anchor_lang::prelude::*;

use crate::error::MarketError;
use crate::math::*;

// Constants
const VIRTUAL_SHARES: u128 = 1_000_000; // 1e6
const VIRTUAL_ASSETS: u128 = 1;

pub fn calculate_total_assets(total_assets: u64) -> Result<u128> {
    (total_assets as u128)
        .checked_add(VIRTUAL_ASSETS)
        .ok_or(error!(MarketError::MathOverflow))
}

pub fn calculate_total_shares(total_shares: u64) -> Result<u128> {
    (total_shares as u128)
        .checked_add(VIRTUAL_SHARES)
        .ok_or(error!(MarketError::MathOverflow))
}

// Calculates the value of `assets` quoted in shares, rounding down.
pub fn to_shares_down(assets: u64, total_assets: u64, total_shares: u64) -> Result<u64> {
    let total_assets = calculate_total_assets(total_assets)?;
    let total_shares = calculate_total_shares(total_shares)?;
    let assets_u128 = assets as u128;

    mul_div_down(assets_u128, total_shares, total_assets)
}

// Calculates the value of `shares` quoted in assets, rounding down.
pub fn to_assets_down(shares: u64, total_assets: u64, total_shares: u64) -> Result<u64> {
    let total_assets = calculate_total_assets(total_assets)?;
    let total_shares = calculate_total_shares(total_shares)?;
    let shares_u128 = shares as u128;

    mul_div_down(shares_u128, total_assets, total_shares)
}

// Calculates the value of `assets` quoted in shares, rounding up.
pub fn to_shares_up(assets: u64, total_assets: u64, total_shares: u64) -> Result<u64> {
    let total_assets = calculate_total_assets(total_assets)?;
    let total_shares = calculate_total_shares(total_shares)?;
    let assets_u128 = assets as u128;

    mul_div_up(assets_u128, total_shares, total_assets)
}

// Calculates the value of `shares` quoted in assets, rounding up.
pub fn to_assets_up(shares: u64, total_assets: u64, total_shares: u64) -> Result<u64> {
    let total_assets = calculate_total_assets(total_assets)?;
    let total_shares = calculate_total_shares(total_shares)?;
    let shares_u128 = shares as u128;

    mul_div_up(shares_u128, total_assets, total_shares)
}