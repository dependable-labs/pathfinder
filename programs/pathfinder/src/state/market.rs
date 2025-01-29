use anchor_lang::prelude::*;

use anchor_lang::solana_program::hash::hash;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};

use crate::error::MarketError;
use crate::state::{MAX_PRICE_AGE, MARKET_SEED_PREFIX};
use crate::math::w_mul_down;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct PythOracle {
    pub feed_id: [u8; 32]
}

impl PythOracle {
    pub fn new(feed_id: &str) -> Result<Self> {

        // TODO: Validate feed_id
        Ok(Self {
            feed_id: get_feed_id_from_hex(&feed_id)?,
        })
    }

    pub fn get_price(&self, pyth_price: &Account<PriceUpdateV2>, upper_bound: bool) -> Result<(u64, u64)> {
        let clock = Clock::get()?;
        let price_feed = pyth_price.get_price_no_older_than(&clock, MAX_PRICE_AGE, &self.feed_id)?;
        

        let price_precision = 10_u64
            .checked_pow(price_feed.exponent.unsigned_abs())
            .ok_or(MarketError::MathOverflow)?;

        let price = price_feed.price as u64;

        let adjusted_price = if upper_bound {
            price
            .checked_add(price_feed.conf as u64)
            .ok_or(MarketError::MathOverflow)?
        } else {
            price
            .checked_sub(price_feed.conf as u64)
            .ok_or(MarketError::MathUnderflow)?
        };

        Ok((adjusted_price, price_precision))
    }

    pub fn hash_feed_id(feed_id: &str) -> [u8; 32] {
        let value = hash(feed_id.as_bytes()).to_bytes();
        msg!("on init hash feed_id: {:?}", value);
        value
    }
    
}

#[account]
pub struct Market {
    pub bump: u8,

    // deposits
    pub deposit_index: u128,
    pub total_shares: u64,
    pub quote_mint: Pubkey,
    pub quote_mint_decimals: u8,

    // borrows
    pub borrow_index: u128,
    pub total_borrow_shares: u64,
    pub total_collateral: u64,
    pub collateral_mint: Pubkey,
    pub collateral_mint_decimals: u8,
    pub ltv_factor: u64,

    // accounting
    pub oracle: PythOracle,
    pub rate_at_target: u64,
    pub last_accrual_timestamp: u64,
}

impl Market {
    pub fn total_deposits(&self) -> Result<u64> {
        w_mul_down(self.deposit_index as u64, self.total_shares)
    }

    pub fn total_borrows(&self) -> Result<u64> {
        w_mul_down(self.borrow_index as u64, self.total_borrow_shares)
    }
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

#[account]
pub struct PositionDelegate {
    pub bump: u8,
    pub delegate: Pubkey,   // The authorized delegate
}


#[macro_export]
macro_rules! generate_market_seeds {
    ($market:expr) => {{
        &[
            MARKET_SEED_PREFIX,
            $market.quote_mint.as_ref(),
            $market.collateral_mint.as_ref(),
            &$market.ltv_factor.to_le_bytes(),
            &$market.oracle.feed_id,
            &[$market.bump],
        ]
    }};
}
