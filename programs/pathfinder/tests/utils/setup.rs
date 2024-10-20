use anchor_lang::prelude::*;
// use test_case::test_case;

use solana_program_test::*;
use solana_sdk::{signature::Keypair, account::Account, signature::Signer};

use crate::utils::{spl::MintFixture, market::MarketFixture, user::UserFixture};
use std::{cell::RefCell, collections::HashMap, rc::Rc};

#[derive(Debug, Clone, Ord, PartialOrd, Eq, PartialEq, Hash)]
pub enum MarketMint {
    Usdc,
}

impl Default for MarketMint {
    fn default() -> Self {
        Self::Usdc
    }
}

pub const USDC_MINT_DECIMALS: u8 = 6;

pub struct TestFixture {
    pub context: Rc<RefCell<ProgramTestContext>>,
    pub markets: HashMap<MarketMint, MarketFixture>,
    pub payer: Keypair,
    pub usdc_mint: MintFixture,
    // pub sol_mint: MintFixture,
}

impl TestFixture {
    pub async fn new() -> Self {

        let mut program = ProgramTest::default();
        program.prefer_bpf(true);
        program.add_program("markets", markets::ID, None);

        let payer = Keypair::new();

        let usdc_keypair = Keypair::new();

        let context = Rc::new(RefCell::new(program.start_with_context().await));

        let usdc_mint_f = MintFixture::new(
            Rc::clone(&context),
            Some(usdc_keypair),
            Some(USDC_MINT_DECIMALS),
        )
        .await;

        // program.add_account(
        //     PYTH_USDC_FEED,
        //     create_pyth_legacy_oracle_account(
        //         usdc_keypair.pubkey(),
        //         1.0,
        //         USDC_MINT_DECIMALS.into(),
        //         None,
        //     ), // create_pyth_price_account(usdc_keypair.pubkey(), 1.0, USDC_MINT_DECIMALS.into(), None),
        // );

        let mut markets = HashMap::new();
        let usdc_market = MarketFixture::new(Rc::clone(&context), &usdc_mint_f);
        markets.insert(MarketMint::Usdc, usdc_market);

        TestFixture {
            context: Rc::clone(&context),
            markets,
            payer,
            usdc_mint: usdc_mint_f,
        }
    }

    pub fn get_market(&self, market_mint: &MarketMint) -> &MarketFixture {
        self.markets.get(market_mint).unwrap()
    }

    pub async fn new_user(&self) -> UserFixture {
        //create a new user and fund with 1 SOL
        // let user = Keypair::new();
        // self.program.add_account(
        //     user.pubkey(),
        //     Account {
        //         lamports: 1_000_000_000,
        //         ..Account::default()
        //     },
        // );
        UserFixture::new(Rc::clone(&self.context)).await
    }
}