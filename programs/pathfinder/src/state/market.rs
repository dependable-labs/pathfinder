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
    pub lp_mint: Pubkey,
    pub collateral_amount: u64,
    pub collateral_mint: Pubkey,
    pub collateral_mint_decimals: u8,
    pub quote_amount: u64,
    pub quote_mint: Pubkey,
    pub quote_mint_decimals: u8,
    pub lltv: u128,
    pub oracle: PythOracle,
}

impl Market {

    /// Convert an amount of assets to shares
    pub fn convert_to_shares(&self, total_shares: u64, total_assets: u64, amount: u64) -> Result<u64> {
        // If total_assets is 0, it means that the vault is empty and the amount is the same as the shares
        if total_assets == 0 || total_shares == 0 {
            return Ok(amount);
        }

        amount
            .checked_mul(total_shares)
            .and_then(|result| result.checked_div(total_assets))
            .ok_or(MarketError::ArithmeticError.into())
    }

    /// Preview the number of shares that would be minted for a given deposit amount
    pub fn deposit_preview(&self, total_shares: u64, total_assets: u64, amount: u64) -> Result<u64> {
        self.convert_to_shares(total_shares, total_assets, amount)
    }

    /// Preview the number of shares that would be burned for a given withdrawal amount
    pub fn withdraw_preview(&self, total_shares: u64, total_assets: u64, amount: u64) -> Result<u64> {
        self.convert_to_shares(total_shares, total_assets, amount)
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