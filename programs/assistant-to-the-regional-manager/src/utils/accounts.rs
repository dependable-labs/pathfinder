use anchor_lang::prelude::*;
use crate::error::ManagerError;
use crate::state::MarketConfig;
use pathfinder::state::{Market, LenderShares};

/// Loads a Pathfinder Market account from an AccountInfo
/// Validates that the account is owned by the program
// pub fn load_path_market<'info>(ai: &AccountInfo<'info>) -> Result<Account<'info, Market>> {
//     // Verify the account is owned by the program
//     require!(
//         ai.owner.eq(&pathfinder::ID),
//         ManagerError::InvalidPathfinderMarket
//     );

//     // let market_data = ai.try_borrow_data()?;
    
//     // Deserialize the account data
//     // Ok(Market::deserialize(
//     //     &mut &market_data.as_ref()[8..],
//     // )?)
//     Ok(Account::<Market>::try_from(ai)?)
// }


/// Loads a Pathfinder LenderShares account from an AccountInfo
/// Validates that the account is owned by the program
// pub fn load_path_lender_shares<'info>(ai: &'info AccountInfo<'info>) -> Result<Account<'info, LenderShares>> {
//     // Verify the account is owned by the program
//     require!(
//         ai.owner.eq(&pathfinder::ID),
//         ManagerError::InvalidPathfinderLenderShares
//     );

//     // let lender_shares_data = ai.try_borrow_data()?;
    
//     // Deserialize the account data
//     // Ok(LenderShares::deserialize(
//     //     &mut &lender_shares_data.as_ref()[8..],
//     // )?)

//     Ok(Account::<LenderShares>::try_from(ai)?)
// }



/// Loads a MarketConfig account from an AccountInfo
/// Validates that the account is owned by the program
pub fn load_market_config(ai: &AccountInfo) -> Result<MarketConfig> {
    // Verify the account is owned by the program
    require!(
        ai.owner.eq(&crate::ID),
        ManagerError::InvalidMarketConfig
    );

    let market_config_data = ai.try_borrow_data()?;
    
    // Deserialize the account data
    Ok(MarketConfig::deserialize(
        &mut &market_config_data.as_ref()[8..],
    )?)
}

/// Validates that a MarketConfig PDA matches expected values
pub fn validate_market_config_pda(
    ai: &AccountInfo,
    config_key: &Pubkey,
    market_pubkey: &Pubkey,
) -> Result<()> {

    // Derive the expected market config PDA
    let seeds = &[
        crate::state::MANAGER_MARKET_CONFIG_SEED_PREFIX,
        config_key.as_ref(),
        market_pubkey.as_ref(),
    ];

    let (expected_pda, _) = Pubkey::find_program_address(seeds, &crate::ID);

    // Verify the account matches the expected PDA
    require!(
        ai.key() == expected_pda,
        ManagerError::InvalidMarketConfig
    );

    // TODO: Inspect these bump values... they were not matching
    // let (expected_market_config_pda, expected_bump) = Pubkey::find_program_address(seeds, ctx.program_id);
    // if market_config.bump != expected_bump {
    //   return err!(ManagerError::InvalidMarketConfig);
    // }

    Ok(())
}

// pub fn validate_pathfinder_market<'info>(
//     market: &Account<'info, Market>,
//     market_pubkey: &Pubkey,
// ) -> Result<()> {
//     // Derive the expected market config PDA
//     let seeds = &[
//         pathfinder::state::MARKET_SEED_PREFIX,
//         &market.quote_mint.key().as_ref(),
//         &market.collateral_mint.key().as_ref(),
//         &market.ltv_factor.to_le_bytes(),
//         &market.oracle.id.to_bytes(),
//     ];

//     let (expected_pda, _) = Pubkey::find_program_address(seeds, &pathfinder::ID);

//     // Verify the account matches the expected PDA
//     require!(
//         market_pubkey.key() == expected_pda,
//         ManagerError::InvalidPathfinderMarket
//     );

//     Ok(())
// }

// pub fn validate_pathfinder_lender_shares(
//     market_pubkey: &Pubkey,
//     lender_shares_pubkey: &Pubkey,
//     owner: &Pubkey,
// ) -> Result<()> {
//     // Derive the expected market config PDA
//     let seeds = &[
//         pathfinder::state::MARKET_SHARES_SEED_PREFIX,
//         market_pubkey.as_ref(),
//         owner.as_ref(),
//     ];

//     let (expected_pda, _) = Pubkey::find_program_address(seeds, &pathfinder::ID);

//     // Verify the account matches the expected PDA
//     require!(
//         lender_shares_pubkey.key() == expected_pda,
//         ManagerError::InvalidPathfinderLenderShares
//     );

//     Ok(())
// }