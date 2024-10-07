
// use anchor_lang::prelude::*;
// // use solana_program_test::*;
// // use solana_sdk::{pubkey::Pubkey, signature::Keypair};
// // use markets::ID as MARKETS_PROGRAM_ID;


// struct TestFixture;

// impl TestFixture {
//     pub async fn new(settings: Option<TestSettings>) -> TestFixture {
//         let mut program = ProgramTest::default();

//         // let mem_map_not_copy_feature_gate = pubkey!("EenyoWx9UMXYKpR8mW5Jmfmy2fRjzUtM7NduYMY8bx33");
//         // program.deactivate_feature(mem_map_not_copy_feature_gate);

//         // program.prefer_bpf(true);
//         program.add_program("markets", markets::ID, None);

//         // let usdc_keypair = Keypair::new();

//         // program.add_account(
//         //     PYTH_USDC_FEED,
//         //     create_pyth_legacy_oracle_account(
//         //         usdc_keypair.pubkey(),
//         //         1.0,
//         //         USDC_MINT_DECIMALS.into(),
//         //         None,
//         //     ), // create_pyth_price_account(usdc_keypair.pubkey(), 1.0, USDC_MINT_DECIMALS.into(), None),
//         // );

//         Self {}
//     }

//     // async fn deposit(&mut self, amount: u64) -> Result<(), ProgramError> {
//     //     // Create and send deposit transaction
//     //     // Return result
//     // }

//     // Add other helper methods as needed
// }