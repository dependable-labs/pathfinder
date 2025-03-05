use anchor_lang::prelude::*;

pub const QUEUE_SEED_PREFIX: &[u8] = b"managerqueue";
pub const CONFIG_SEED_PREFIX: &[u8] = b"managerconfig";
pub const MARKET_CONFIG_SEED_PREFIX: &[u8] = b"managermarketconfig";

pub const PATHFINDER_PROGRAM_ID: Pubkey = pubkey!("7ALFC87zvuPvpp9h5Stq9SSP3kTCUJfhtirEZVJmZYy4");
pub const MAX_QUEUE_LENGTH: usize = 10;