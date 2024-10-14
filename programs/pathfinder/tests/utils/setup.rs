use anchor_lang::prelude::*;
use anchor_spl::token::spl_token;
use test_case::test_case;

use solana_program_test::*;
use solana_sdk::signature::Keypair;

pub struct TestFixture {
    pub context: ProgramTestContext,
    // pub program: ProgramTest,
    pub payer: Keypair,
    // pub usdc_mint: MintFixture,
    // pub sol_mint: MintFixture,
}

impl TestFixture {
    pub async fn new() -> Self {
        // let mut program = ProgramTest::default();
        // program.prefer_bpf(true);
        // program.add_program("markets", markets::ID, None);

        let mut program = ProgramTest::default();

        program.prefer_bpf(true);
        program.add_program("markets", markets::ID, None);

        // program.add_account(
        //     PYTH_USDC_FEED,
        //     create_pyth_legacy_oracle_account(
        //         usdc_keypair.pubkey(),
        //         1.0,
        //         USDC_MINT_DECIMALS.into(),
        //         None,
        //     ), // create_pyth_price_account(usdc_keypair.pubkey(), 1.0, USDC_MINT_DECIMALS.into(), None),
        // );

        let context = program.start_with_context().await;

        let payer = Keypair::new();

        TestFixture {
            context,
            // program,
            payer,
        }
    }
}