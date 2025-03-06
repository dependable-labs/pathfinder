use anchor_lang::prelude::*;
use crate::error::ManagerError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PendingU64 {
    /// The pending value to set
    pub value: u64,
    /// The timestamp at which the pending value becomes valid
    pub valid_at: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PendingPubkey {
    /// The pending value to set
    pub value: Pubkey,
    /// The timestamp at which the pending value becomes valid
    pub valid_at: u64,
}

/// Helper functions for managing pending values and their validity timestamps
pub trait PendingUpdate {
    fn update(&mut self, new_value: u64, timelock: u64) -> Result<()>;
}

impl PendingUpdate for PendingU64 {
  fn update(&mut self, new_value: u64, timelock: u64) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp as u64;

    self.value = new_value;
    self.valid_at = current_time
        .checked_add(timelock)
        .ok_or(ManagerError::MathOverflow)?;

    Ok(())
  }
}

impl PendingUpdate for PendingPubkey {
  fn update(&mut self, _new_value: u64, timelock: u64) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp as u64;

    self.valid_at = current_time
        .checked_add(timelock)
        .ok_or(ManagerError::MathOverflow)?;

    Ok(())
  }
}
