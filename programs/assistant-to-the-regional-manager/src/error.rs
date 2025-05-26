use anchor_lang::prelude::*;

#[error_code]
pub enum ManagerError {
    #[msg("Unauthorized curator")]
    UnauthorizedCurator,

    #[msg("Max queue length exceeded")]
    MaxQueueLengthExceeded,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Math underflow")]
    MathUnderflow,

    // market cap
    #[msg("Unauthorized market")]
    UnauthorizedMarket,

    #[msg("Invalid manager market config")]
    InvalidManagerMarketConfig,

    #[msg("Invalid pathfinder market config")]
    InvalidPathfinderMarketConfig,

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

    #[msg("Market cap reached")]
    MarketCapReached,

    #[msg("Invalid supply queue")]
    InvalidSupplyQueue,

    #[msg("Invalid lender shares")]
    InvalidLenderShares,

    #[msg("Max fee exceeded")]
    MaxFeeExceeded,

    #[msg("Zero fee recipient")]
    ZeroFeeRecipient,

    #[msg("Not enough liquidity")]
    NotEnoughLiquidity,

    #[msg("Invalid withdraw queue")]
    InvalidWithdrawQueue,

    #[msg("Market not found")]
    MarketNotFound,
}
