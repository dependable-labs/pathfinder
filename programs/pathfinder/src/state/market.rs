use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct PythOracle {
    pub feed_id: [u8; 32],
    pub max_age: u64,
}

impl PythOracle {
    pub fn new(oracle_address: &str, max_age: u64) -> Result<Self> {
        let feed_id = get_feed_id_from_hex(oracle_address)?;
        Ok(Self { feed_id, max_age })
    }

    pub fn get_price(&self, pyth_price: &Account<PriceUpdateV2>, clock: &Clock) -> Result<i64> {
        let price = pyth_price.get_price_no_older_than(clock, self.max_age, &self.feed_id)?;
        Ok(price.price)
    }
}

#[account]
#[derive(Default)]
pub struct Market {
    pub bump: u8,

    pub lp_mint: Pubkey,

    pub quote_mint: Pubkey,
    pub collateral_mint: Pubkey,

    pub quote_mint_decimals: u8,
    pub collateral_mint_decimals: u8,

    pub quote_amount: u64,
    pub collateral_amount: u64,

    pub lltv: u128,
    pub oracle: PythOracle,
    // pub irm: Pubkey,
}

impl Market {
    // pub fn k(&self) -> u128 {
    //     self.quote_amount as u128 * self.collateral_amount as u128
    // }

    // / Get the number of base and quote tokens withdrawable from a position
    // pub fn get_base_and_quote_withdrawable(
    //     &self,
    //     lp_tokens: u64,
    //     lp_total_supply: u64,
    // ) -> (u64, u64) {
    //     (
    //         self.get_base_withdrawable(lp_tokens, lp_total_supply),
    //         self.get_quote_withdrawable(lp_tokens, lp_total_supply),
    //     )
    // }

    // /// Get the number of base tokens withdrawable from a position
    // pub fn get_base_withdrawable(&self, lp_tokens: u64, lp_total_supply: u64) -> u64 {
    //     // must fit back into u64 since `lp_tokens` <= `lp_total_supply`
    //     ((lp_tokens as u128 * self.base_amount as u128) / lp_total_supply as u128) as u64
    // }

    // /// Get the number of quote tokens withdrawable from a position
    // pub fn get_quote_withdrawable(&self, lp_tokens: u64, lp_total_supply: u64) -> u64 {
    //     ((lp_tokens as u128 * self.quote_amount as u128) / lp_total_supply as u128) as u64
    // }
}

#[macro_export]
macro_rules! generate_amm_seeds {
    ($amm:expr) => {{
        &[
            MARKET_SEED_PREFIX,
            $amm.base_mint.as_ref(),
            $amm.quote_mint.as_ref(),
            &[$amm.bump],
        ]
    }};
}