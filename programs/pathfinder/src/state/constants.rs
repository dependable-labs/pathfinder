
pub const MARKET_SEED_PREFIX: &[u8] = b"market";
pub const DELEGATE_SEED_PREFIX: &[u8] = b"delegate";
pub const CONFIG_SEED_PREFIX: &[u8] = b"config";
pub const MARKET_SHARES_SEED_PREFIX: &[u8] = b"lender_shares";
pub const BORROWER_SHARES_SEED_PREFIX: &[u8] = b"borrower_shares";

// 0.3 * 1e18
pub const LIQUIDATION_CURSOR: u64 = 300_000_000_000_000_000;
// 1.15 * 1e18
pub const MAX_LIQUIDATION_INCENTIVE_FACTOR: u64 = 1_150_000_000_000_000_000;

pub const MAX_PRICE_AGE: u64 = 3600; // 1 hour

pub const MAX_FEE_FACTOR: u128 = 100_000_000_000_000_000; // 10% in WAD (0.1 * 1e18)
