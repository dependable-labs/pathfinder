use anchor_lang::prelude::*;
use anchor_spl::token::spl_token;
use solana_sdk::signature::{Keypair, Signer};
use test_case::test_case;
use crate::utils::{setup::{MarketMint, TestFixture}, user::UserFixture};

use solana_program_test::*;

use std::{rc::Rc};

#[test_case(1000000, MarketMint::Usdc)]
#[tokio::test]

async fn deposit_success(
  deposit_amount: u64,
  quote_mint: MarketMint
) {

  let test_f = TestFixture::new().await;
  let market = test_f.get_market(&quote_mint);

  market.try_create_market().await.unwrap();

  // initialize lender
  // let lizz = test_f.new_user().await;
  // market.mint.create_token_account_and_mint_to(&lizz, deposit_amount).await;

  // deposit
  // market.try_deposit(&lizz, deposit_amount, 0).await.unwrap();

  // test

  assert_eq!(1, 1, "This test is intentionally set to fail");
}
