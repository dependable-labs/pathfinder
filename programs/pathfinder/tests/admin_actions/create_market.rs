use anchor_lang::prelude::*;
use anchor_spl::token::spl_token;
use solana_sdk::signature::{Keypair, Signer};
use test_case::test_case;

use markets::state::market::Market;

use crate::utils::{setup::{MarketMint, TestFixture}, user::UserFixture};

use solana_program_test::*;

use std::{rc::Rc};

#[test_case(MarketMint::Usdc)]
#[tokio::test]

async fn create_market_success(
  quote_mint: MarketMint
) {

  let test_f = TestFixture::new().await;
  let market = test_f.get_market(&quote_mint);

  market.try_create_market().await.unwrap();

  // test

  // Check if the market has the expected initial state
  let market_state = test_f.load_and_deserialize::<Market>(&market.market_account).await;
  assert_eq!(market_state.quote_mint, market.mint.key, "Market should have the correct quote mint");
  assert_eq!(market_state.total_quote, 0, "Market total_quote should be initialized to 0");
  assert_eq!(market_state.quote_mint_decimals, market.mint.mint.decimals, "Market should have the correct quote mint decimals");
  assert_eq!(market_state.total_shares, 0, "Market total_shares should be initialized to 0");

}
