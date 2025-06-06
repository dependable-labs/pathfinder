use anchor_lang::prelude::*;

use crate::math::*;
use crate::state::oracle::Oracle;

#[account]
pub struct Market {
    pub bump: u8,

    // deposits
    pub total_deposits: u128,
    pub total_shares: u64,
    pub quote_mint: Pubkey,
    pub quote_mint_decimals: u8,

    // borrows
    pub total_borrows: u128,
    pub total_borrow_shares: u64,
    pub total_collateral: u64,
    pub collateral_mint: Pubkey,
    pub collateral_mint_decimals: u8,
    pub ltv_factor: u64,

    // accounting
    pub oracle: Oracle,
    pub rate_at_target: u128,
    pub last_accrual_timestamp: u64,
    pub fee_shares: u64,
}

#[account]
pub struct LenderShares {
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
    pub delegate: Pubkey, // The authorized delegate
}

#[macro_export]
macro_rules! generate_config_seeds {
    ($config:expr) => {{
        &[CONFIG_SEED_PREFIX, &[$config.bump]]
    }};
}

#[macro_export]
macro_rules! generate_market_seeds {
    ($market:expr) => {{
        &[
            MARKET_SEED_PREFIX,
            $market.quote_mint.as_ref(),
            $market.collateral_mint.as_ref(),
            &$market.ltv_factor.to_le_bytes(),
            &$market.oracle.id.to_bytes(),
            &[$market.bump],
        ]
    }};
}
