use crate::{error::ManagerError, state::PATHFINDER_PROGRAM_ID};
use anchor_lang::prelude::*;
use pathfinder::state::Market;

pub fn validate_manager_market_config<'info>(
    ai: &AccountInfo<'info>,
    market: &Pubkey,
    manager_config: &Pubkey,
) -> Result<()> {

    require!(
        ai.owner == &crate::ID,
        ManagerError::InvalidAccountOwner
    );

    let (expected_pda, _) = Pubkey::find_program_address(
        &[
            crate::state::MANAGER_MARKET_CONFIG_SEED_PREFIX,
            manager_config.key().as_ref(),
            market.key().as_ref(),
        ],
        &crate::ID,
    );

    require!(
        ai.key() == expected_pda,
        ManagerError::InvalidManagerMarketConfig
    );

    Ok(())
}

// Validates that a Market PDA matches expected values
pub fn validate_pathfinder_market<'info>(
    ai: &AccountInfo<'info>,
    market: &Market,
) -> Result<()> {

    require!(
        ai.owner == &PATHFINDER_PROGRAM_ID,
        ManagerError::InvalidAccountOwner
    );

    let expected_pda = Pubkey::create_program_address(
        &[
            pathfinder::state::MARKET_SEED_PREFIX,
            &market.quote_mint.key().as_ref(),
            &market.collateral_mint.key().as_ref(),
            &market.ltv_factor.to_le_bytes().as_ref(),
            &market.oracle.id.to_bytes().as_ref(),
            &[market.bump],
        ],
        &PATHFINDER_PROGRAM_ID,
    )
    .map_err(|_| ManagerError::InvalidPathfinderMarketConfig)?;

    require!(
        ai.key() == expected_pda,
        ManagerError::InvalidPathfinderMarketConfig
    );
    Ok(())
}