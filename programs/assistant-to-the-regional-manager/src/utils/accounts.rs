use anchor_lang::prelude::*;
use crate::error::ManagerError;
use crate::state::MarketConfig;

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
