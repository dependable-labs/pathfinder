use anchor_lang::prelude::*;

#[error_code]
pub enum ManagerError {
    #[msg("Unauthorized curator")]
    UnauthorizedCurator,

    #[msg("Max queue length exceeded")]
    MaxQueueLengthExceeded,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Unauthorized market")]
    UnauthorizedMarket,

    #[msg("Invalid market config")]
    InvalidMarketConfig,

    #[msg("Market is not enabled")]
    MarketNotEnabled,

    #[msg("Market cap is already pending")]
    AlreadyPending,

    #[msg("Market is pending removal")]
    PendingRemoval,

    #[msg("Market cap is already set")]
    AlreadySet,
}