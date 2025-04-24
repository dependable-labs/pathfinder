use anchor_lang::prelude::*;

#[error_code]
pub enum ManagerError {
    #[msg("Unauthorized curator")]
    UnauthorizedCurator,

    #[msg("Max queue length exceeded")]
    MaxQueueLengthExceeded,

    #[msg("Math overflow")]
    MathOverflow,

    // market cap
    #[msg("Unauthorized market")]
    UnauthorizedMarket,

    #[msg("Invalid market config")]
    InvalidMarketConfig,

    #[msg("Market is not enabled")]
    MarketNotEnabled,

    #[msg("Already pending")]
    AlreadyPending,

    #[msg("Market is pending removal")]
    PendingRemoval,

    #[msg("Non-zero cap")]
    NonZeroCap,

    #[msg("Pending cap")]
    PendingCap,

    #[msg("Already set")]
    AlreadySet,

    // timelock
    #[msg("No pending timelock")]
    NoPendingTimelock,

    #[msg("Timelock not expired")]
    TimelockNotExpired,

    #[msg("Above max timelock")]
    AboveMaxTimelock,

    #[msg("Below min timelock")]
    BelowMinTimelock,

    #[msg("No pending value")]
    NoPendingValue,

    #[msg("Timelock not elapsed")]
    TimelockNotElapsed,

    #[msg("Unauthorized signer")]
    UnauthorizedSigner,

    #[msg("Duplicate market")]
    DuplicateMarket,

    #[msg("Invalid market removal")]
    InvalidMarketRemoval,

    #[msg("Non-zero supply")]
    NonZeroSupply,

    #[msg("Market not in queue")]
    MarketNotInQueue,

    #[msg("Invalid market removal non-zero cap")]
    InvalidMarketRemovalNonZeroCap,

    #[msg("Invalid market removal non-zero supply")]
    InvalidMarketRemovalNonZeroSupply,

    #[msg("Invalid market removal timelock not elapsed")]
    InvalidMarketRemovalTimelockNotElapsed,

    #[msg("Invalid pathfinder market")]
    InvalidPathfinderMarket,

    #[msg("Invalid pathfinder lender shares")]
    InvalidPathfinderLenderShares,

    #[msg("Market queue mismatch")]
    MarketQueueMismatch,
}