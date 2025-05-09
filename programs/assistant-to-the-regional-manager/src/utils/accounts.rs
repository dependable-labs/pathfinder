use anchor_lang::prelude::*;
use crate::{error::ManagerError, state::PATHFINDER_PROGRAM_ID};
use crate::state::ManagerMarketConfig;
use pathfinder::state::{Market, LenderShares, Config};
use crate::state::ManagerVaultConfig;

/// Loads a MarketConfig account from an AccountInfo
/// Validates that the account is owned by the program
// pub fn load_manager_market_config(ai: &AccountInfo) -> Result<ManagerMarketConfig> {
//     // Verify the account is owned by the program
//     require!(
//         ai.owner.eq(&crate::ID),
//         ManagerError::InvalidManagerMarketConfig
//     );

//     let market_config_data = ai.try_borrow_data()?;
    
//     // Deserialize the account data
//     Ok(ManagerMarketConfig::deserialize(
//         &mut &market_config_data.as_ref()[8..],
//     )?)
// }

pub fn validate_manager_market_config_pda(
    ai: &Pubkey,
    market: &Pubkey,
    manager_config: &Pubkey,
) -> Result<()> {
    let (expected_pda, _) = Pubkey::find_program_address(
        &[
            crate::state::MANAGER_MARKET_CONFIG_SEED_PREFIX,
            manager_config.key().as_ref(),
            market.key().as_ref(),
        ],
        &crate::ID
    );

    require!(ai.key() == expected_pda, ManagerError::InvalidManagerMarketConfig);
    Ok(())
}


// Validates that a Market PDA matches expected values
pub fn validate_pathfinder_market_pda(
    ai: &Pubkey,
    market: &Market,
) -> Result<()> {
    let expected_pda= Pubkey::create_program_address(
        &[
            pathfinder::state::MARKET_SEED_PREFIX,
            market.quote_mint.key().as_ref(),
            market.collateral_mint.key().as_ref(),
            market.ltv_factor.to_le_bytes().as_ref(),
            market.oracle.id.to_bytes().as_ref(),
            &[market.bump]
        ],
        &PATHFINDER_PROGRAM_ID
    ).map_err(|_| ManagerError::InvalidPathfinderMarketConfig)?;

    require!(ai.key() == expected_pda, ManagerError::InvalidPathfinderMarketConfig);
    Ok(())
}

// Validates that a MarketConfig PDA matches expected values
pub fn validate_pathfinder_lender_shares_pda(
    market_info: &Pubkey,
    manager_config_info: &Pubkey,
    lender_shares_info: &Pubkey,
) -> Result<()> {

    let (expected_pda, _) = Pubkey::find_program_address(
        &[
            pathfinder::state::MARKET_SHARES_SEED_PREFIX,
            market_info.key().as_ref(),
            manager_config_info.key().as_ref(),
        ],
        &PATHFINDER_PROGRAM_ID
    );

    require!(lender_shares_info.key() == expected_pda, ManagerError::InvalidLenderShares);
    Ok(())
}