mod controller;
mod market;

pub use controller::*;
pub use market::*;

pub const MARKET_SEED_PREFIX: &[u8] = b"market";
pub const CONTROLLER_SEED_PREFIX: &[u8] = b"controller";
pub const MARKET_SHARES_SEED_PREFIX: &[u8] = b"market_shares";
pub const BORROWER_SHARES_SEED_PREFIX: &[u8] = b"borrower_shares";
pub const MARKET_COLLATERAL_SEED_PREFIX: &[u8] = b"market_collateral";

// 0.3 * 1e18
pub const LIQUIDATION_CURSOR: u64 = 300_000_000_000_000_000;
// 1.15 * 1e18
pub const MAX_LIQUIDATION_INCENTIVE_FACTOR: u64 = 1_150_000_000_000_000_000;
