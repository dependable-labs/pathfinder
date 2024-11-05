use anchor_lang::prelude::*;

#[error_code]
pub enum MarketError {
    // authority
    #[msg("Authority already set")]
    AuthorityAlreadySet,

    // market
    #[msg("You can't create an market with two of the same token mints")]
    SameTokenMints,
    #[msg("The user had insufficient balance to do this")]
    InsufficientBalance,
    #[msg("Must remove a non-zero amount of liquidity")]
    ZeroLiquidityRemove,
    #[msg("Must specify a non-zero `min_lp_tokens` when adding to an existing market")]
    ZeroMinLpTokens,
    #[msg("`quote_amount` must be greater than 100000000 when initializing a pool")]
    InsufficientQuoteAmount,
    #[msg("Users must deposita non-zero amount")]
    ZeroDepositAmount,
    #[msg("Invalid withdraw input")]
    InvalidWithdrawInput,
    #[msg("Invalid deposit input")]
    InvalidDepositInput,
    #[msg("Invalid oracle ID")]
    InvalidOracleId,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Arithmetic error occurred")]
    ArithmeticError,
    #[msg("Math Underflow")]
    MathUnderflow,
    #[msg("Invalid deposit collateral input")]
    InvalidDepositCollateralInput,
    #[msg("Invalid borrow input")]
    InvalidBorrowInput,
    #[msg("Invalid accrual timestamp")]
    InvalidAccrualTimestamp,
    #[msg("No time elapsed")]
    NoTimeElapsed,
    #[msg("Debt cap exceeded")]
    DebtCapExceeded,
}
