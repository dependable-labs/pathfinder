use anchor_lang::prelude::*;

pub mod constants;

pub use constants::*;

// Config Account - Contains core configuration and authority data
// Config Account - Main vault configuration
// This is the main config account for each vault instance
#[account]
pub struct ManagerVaultConfig {
  pub bump: u8,
  pub name: String,
  pub symbol: String,
  pub quote_mint: Pubkey,
  pub curator: Pubkey,
  pub guardian: Pubkey,
  pub fee_recipient: Pubkey,
  pub skim_recipient: Pubkey,
  pub timelock: u64,
  pub fee: u64,  // Using u64 instead of u96
  pub decimals_offset: u8,
  pub pathfinder_program: Pubkey,  // The PATHFINDER immutable
  pub last_total_assets: u64,
}

// Allocator Account - Stores allocator permissions
// (Multiple accounts, one per allocator)
// Allocator Account - One per allocator
// ["manager", vault_address, "allocator", allocator_address]
// Derived for each allocator address
#[account]
pub struct AllocatorState {
  pub bump: u8,
  pub allocator: Pubkey,
  pub is_allocator: bool,
}

// Market Config Account - Stores configuration for each market
// (Multiple accounts, one per market)
// ["managermarketconfig", vault_address, market_id]
#[account]
pub struct MarketConfig {
  pub bump: u8,
  pub enabled: bool,
  pub cap: u64,           // Supply cap for this market
  pub removable_at: u64,  // Timestamp when market can be removed
  pub pending_cap: u64,   // Pending cap change
}

// Queue Account - Stores supply and withdraw queues
// (Multiple accounts, one per queue)
// Queue Account - Single queue state per vault
// Single account holding both queues
// ["managerqueue", vault_address]
#[account]
pub struct QueueState {
  pub bump: u8,
  pub supply_queue: Vec<Pubkey>,    // Vector of market IDs
  pub withdraw_queue: Vec<Pubkey>,   // Vector of market IDs
}

// Pending State Account - Stores pending changes
// (Multiple accounts, one per pending state)
// Pending State Account - Single pending state per vault
// ["manager", vault_address, "pending"]
// Single account for pending changes
#[account]
pub struct PendingState {
  pub bump: u8,
  pub pending_guardian: Option<Pubkey>,
  pub pending_timelock: Option<u64>,
}

#[macro_export]
macro_rules! generate_manager_vault_seeds {
    ($vault:expr) => {{
        &[
            CONFIG_SEED_PREFIX,
            $vault.quote_mint.as_ref(),
            $vault.symbol.as_ref(),
            $vault.name.as_ref(),
            &[$vault.bump],
        ]
    }};
}