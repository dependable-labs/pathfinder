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
    pub collateral: u64,
}

impl Market {


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