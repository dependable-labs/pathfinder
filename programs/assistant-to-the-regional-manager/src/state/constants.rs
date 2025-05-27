use anchor_lang::prelude::*;

pub const MANAGER_QUEUE_SEED_PREFIX: &[u8] = b"managerqueue";
pub const MANAGER_CONFIG_SEED_PREFIX: &[u8] = b"managerconfig";
pub const MANAGER_MARKET_CONFIG_SEED_PREFIX: &[u8] = b"managermarketconfig";
pub const MANAGER_ALLOCATOR_SEED_PREFIX: &[u8] = b"managerallocator";
pub const MANAGER_SHARES_SEED_PREFIX: &[u8] = b"managershares";

// TODO: move PATHFINDER_PROGRAM_ID to being set dynamically
pub const PATHFINDER_PROGRAM_ID: Pubkey = pubkey!("7ALFC87zvuPvpp9h5Stq9SSP3kTCUJfhtirEZVJmZYy4");
pub const MAX_QUEUE_LENGTH: usize = 6;

pub const MAX_FEE: u64 = 500_000_000_000_000_000; // 50% in WAD (0.5 * 1e18)

pub const MAX_TIMELOCK: u64 = 2 * 60 * 60 * 24 * 7; // 2 weeks
pub const MIN_TIMELOCK: u64 = 60 * 60 * 24; // 1 day