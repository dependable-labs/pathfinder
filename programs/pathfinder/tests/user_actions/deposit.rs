use anchor_lang::prelude::*;
use test_case::test_case;
use crate::utils::setup::{MarketMint, TestFixture};

use solana_program_test::*;

#[test_case(1010000, MarketMint::Usdc)]
#[tokio::test]

async fn deposit_success(
  deposit_amount: u64,
  quote_mint: MarketMint
) {

  let test_f = TestFixture::new().await;
  let market = test_f.get_market(&quote_mint);

  market.try_create_market().await.unwrap();

  // initialize lender
  let lizz = test_f.new_user().await;
  let token_account = market.mint.create_ata_and_mint_to(&lizz, deposit_amount).await;

  assert_eq!(token_account.balance().await, deposit_amount, "Token account balance did not increase as expected");
 
  // deposit
  market.try_deposit(&lizz, deposit_amount, 0).await.unwrap();

  // test
  assert_eq!(token_account.balance().await, 0, "Token account balance did not decrease as expected");
  assert_eq!(market.get_quote_ata_fixture().await.balance().await, deposit_amount, "User shares did not decrease as expected");

}
