use anchor_lang::prelude::*;

#[error_code]
pub enum MarketError {
    // Authority Errors
    #[msg("Unauthorized authority")]
    UnauthorizedAuthority,

    // Market Configuration Errors 
    #[msg("You can't create a market with two of the same token mints")]
    SameTokenMints,
    #[msg("Invalid oracle ID")]
    InvalidOracleId,

    // Balance & Liquidity Errors
    #[msg("Insufficient balance")]
    InsufficientBalance,

    // Transaction Input Errors
    #[msg("Invalid withdraw input")]
    InvalidWithdrawInput,
    #[msg("Invalid deposit input")]
    InvalidDepositInput,
    #[msg("Invalid deposit collateral input")]
    InvalidDepositCollateralInput,
    #[msg("Invalid input")]
    InvalidInput,
    #[msg("Asset and share values must be exclusive")]
    AssetShareValueMismatch,

    // Math & Calculation Errors
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Math Underflow")]
    MathUnderflow,

    // Collateral & Solvency Errors
    #[msg("User is not solvent")]
    NotSolvent,
    #[msg("Borrower is solvent")]
    BorrowerIsSolvent,
    #[msg("Collateral is not active")]
    CollateralNotActive,

    #[msg("Unauthorized delegate")]
    UnauthorizedDelegate,

    #[msg("Fee factor exceeds max")]
    FeeExceedsMax,
    #[msg("Fee factor already set")]
    FeeAlreadySet,
    #[msg("Invalid recipient")]
    InvalidRecipient,
    #[msg("Invalid authority")]
    InvalidAuthority,

    #[msg("Unsupported oracle")]
    UnsupportedOracle,
}
