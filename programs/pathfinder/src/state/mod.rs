mod controller;
mod market;

pub use controller::*;
pub use market::*;

pub const MARKET_SEED_PREFIX: &[u8] = b"market";
pub const CONTROLLER_SEED_PREFIX: &[u8] = b"controller";
pub const MARKET_SHARES_SEED_PREFIX: &[u8] = b"market_shares";
pub const BORROWER_SHARES_SEED_PREFIX: &[u8] = b"borrower_shares";
pub const MARKET_COLLATERAL_SEED_PREFIX: &[u8] = b"market_collateral";
