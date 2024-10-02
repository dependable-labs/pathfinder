use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};

use crate::error::MarketError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct PythOracle {
    pub feed_id: [u8; 32],
    pub max_age: u64,
}

impl PythOracle {
    pub fn new(oracle_address: &str, max_age: u64) -> Result<Self> {
        // Check if the oracle string is a valid hex string with correct length
        if oracle_address.len() == 64 || (oracle_address.len() == 66 && oracle_address.starts_with("0x")) {
            let feed_id = get_feed_id_from_hex(oracle_address)?;
            Ok(Self { feed_id, max_age })
        } else {
            // Invalid oracle ID
            Err(error!(MarketError::InvalidOracleId))
        }
    }

    pub fn get_price(&self, pyth_price: &Account<PriceUpdateV2>, clock: &Clock) -> Result<i64> {
        let price = pyth_price.get_price_no_older_than(clock, self.max_age, &self.feed_id)?;
        Ok(price.price)
    }
}

#[account]
pub struct Market {
    pub bump: u8,
    pub total_collateral: u64,
    pub collateral_mint: Pubkey,
    pub collateral_mint_decimals: u8,
    pub total_quote: u64,
    pub quote_mint: Pubkey,
    pub quote_mint_decimals: u8,
    pub lltv: u128,
    pub oracle: PythOracle,
    pub total_shares: u64,
}

#[account]
pub struct UserShares {
    pub market: Pubkey,
    pub user: Pubkey,
    pub shares: u64,
}

impl Market {

    // Constants
    const VIRTUAL_SHARES: u128 = 1_000_000; // 1e6
    const VIRTUAL_ASSETS: u128 = 1;

    fn calculate_total_assets(&self, total_assets: &u64) -> Result<u128> {
        (*total_assets as u128)
            .checked_add(Self::VIRTUAL_ASSETS)
            .ok_or(error!(MarketError::MathOverflow))
    }

    fn calculate_total_shares(&self, total_shares: &u64) -> Result<u128> {
        (*total_shares as u128)
            .checked_add(Self::VIRTUAL_SHARES)
            .ok_or(error!(MarketError::MathOverflow))
    }

    // Calculates the value of `assets` quoted in shares, rounding down.
    pub fn to_shares_down(&self, assets: &u64, total_assets: &u64, total_shares: &u64) -> Result<u64> {
        let total_assets = self.calculate_total_assets(total_assets)?;
        let total_shares = self.calculate_total_shares(total_shares)?;
        let assets_u128 = *assets as u128;

        self.mul_div_down(assets_u128, total_shares, total_assets)
    }

    // Calculates the value of `shares` quoted in assets, rounding down.
    pub fn to_assets_down(&self, shares: &u64, total_assets: &u64, total_shares: &u64) -> Result<u64> {
        let total_assets = self.calculate_total_assets(total_assets)?;
        let total_shares = self.calculate_total_shares(total_shares)?;
        let shares_u128 = *shares as u128;

        self.mul_div_down(shares_u128, total_assets, total_shares)
    }

    // Calculates the value of `assets` quoted in shares, rounding up.
    pub fn to_shares_up(&self, assets: &u64, total_assets: &u64, total_shares: &u64) -> Result<u64> {
        let total_assets = self.calculate_total_assets(total_assets)?;
        let total_shares = self.calculate_total_shares(total_shares)?;
        let assets_u128 = *assets as u128;

        self.mul_div_up(assets_u128, total_shares, total_assets)
    }

    // Calculates the value of `shares` quoted in assets, rounding down.
    pub fn to_assets_up(&self, shares: &u64, total_assets: &u64, total_shares: &u64) -> Result<u64> {
        let total_assets = self.calculate_total_assets(total_assets)?;
        let total_shares = self.calculate_total_shares(total_shares)?;
        let shares_u128 = *shares as u128;

        self.mul_div_up(shares_u128, total_assets, total_shares)
    }

    /// Performs multiplication followed by division, rounding down.
    fn mul_div_down(&self, a: u128, b: u128, c: u128) -> Result<u64> {

        // a * b / c
        let result = a.checked_mul(b)
            .ok_or(error!(MarketError::MathOverflow))?
            .checked_div(c)
            .ok_or(error!(MarketError::MathOverflow))?;
    
        self.u128_to_u64(result)
    }

    /// Performs multiplication followed by division, rounding up.
    fn mul_div_up(&self, a: u128, b: u128, c: u128) -> Result<u64> {

        // (a * b + (c - 1)) / c
        let product = a.checked_mul(b).ok_or(error!(MarketError::MathOverflow))?;
        let c_minus_one = c.checked_sub(1).ok_or(error!(MarketError::MathOverflow))?;
        let numerator = product.checked_add(c_minus_one).ok_or(error!(MarketError::MathOverflow))?;
        let result = numerator.checked_div(c).ok_or(error!(MarketError::MathOverflow))?;

        self.u128_to_u64(result)
    }
    
    pub fn u128_to_u64(&self, value: u128) -> Result<u64> {
        Ok((value & u64::MAX as u128) as u64)
    }

}

#[macro_export]
macro_rules! generate_market_seeds {
    ($market:expr) => {{
        &[
            MARKET_SEED_PREFIX,
            $market.quote_mint.as_ref(),
            $market.collateral_mint.as_ref(),
            &[$market.bump],
        ]
    }};
}