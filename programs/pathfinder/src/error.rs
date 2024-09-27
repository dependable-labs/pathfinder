use anchor_lang::prelude::*;

#[error_code]
pub enum MarketError {
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
    #[msg("Invalid deposit amount")]
    InvalidDepositAmount,
    #[msg("Invalid oracle ID")]
    InvalidOracleId,
    #[msg("Math overflow")]
    MathOverflow,
}
