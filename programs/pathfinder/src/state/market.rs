use anchor_lang::prelude::*;

use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};

use crate::error::MarketError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct PythOracle {
    pub feed_id: [u8; 32],
    pub max_age: u64,
}

impl PythOracle {
    pub fn new(feed_id: &str, max_age: u64) -> Result<Self> {

        // Validate feed_id

        // if feed_id.len() == 64 || (feed_id.len() == 66 && feed_id.starts_with("0x")) {
        // } else {
        //     // Invalid oracle ID
        //     Err(error!(MarketError::InvalidOracleId))
        // }

        Ok(Self {
            feed_id: get_feed_id_from_hex(&feed_id)?,
            max_age,
        })
    }

    pub fn get_price(&self, pyth_price: &Account<PriceUpdateV2>) -> Result<(u64, u64)> {
        let clock = Clock::get()?;
        let price_feed = pyth_price.get_price_no_older_than(&clock, self.max_age, &self.feed_id)?;

        let price_precision = 10_u64
            .checked_pow(price_feed.exponent.unsigned_abs())
            .ok_or(MarketError::MathOverflow)?;

        Ok((price_feed.price as u64, price_precision))
    }
}

#[account]
pub struct Market {
    pub bump: u8,
    pub total_quote: u64,
    pub quote_mint: Pubkey,
    pub quote_mint_decimals: u8,
    pub total_shares: u64,
    pub total_borrow_shares: u64,
    pub total_borrow_assets: u64,
    pub last_accrual_timestamp: u64,
    pub debt_cap: u64,
    pub rate_at_target: u64,
}

#[account]
pub struct Collateral {
    pub bump: u8,
    pub total_collateral: u64,
    pub collateral_mint: Pubkey,
    pub collateral_mint_decimals: u8,
    pub ltv_factor: u64,
    pub oracle: PythOracle,
}

#[account]
pub struct UserShares {
    pub bump: u8,
    pub shares: u64,
}

#[account]
pub struct BorrowerShares {
    pub bump: u8,
    pub borrow_shares: u64,
    pub collateral_amount: u64,
}

#[macro_export]
macro_rules! generate_market_seeds {
    ($market:expr) => {{
        &[
            MARKET_SEED_PREFIX,
            $market.quote_mint.as_ref(),
            &[$market.bump],
        ]
    }};
}

#[macro_export]
macro_rules! generate_collateral_seeds {
    ($market:expr) => {{
        &[
            MARKET_COLLATERAL_SEED_PREFIX,
            $market.quote_mint.as_ref(),
            $collateral.mint.as_ref(),
            &[$collateral.bump],
        ]
    }};
}