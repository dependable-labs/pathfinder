use crate::error::MarketError;
use crate::math::*;
use crate::state::*;
use anchor_lang::prelude::*;
use crate::instructions::views::balances::expected_market_balances;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ViewMarketWithLenderSharesArgs {
    pub owner: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: ViewMarketWithLenderSharesArgs)]
pub struct ViewMarketWithLenderShares<'info> {
    // config
    #[account(
    seeds = [CONFIG_SEED_PREFIX],
    bump,
  )]
    pub config: Account<'info, Config>,

    // market
    #[account(
      seeds = [
        MARKET_SEED_PREFIX,
        &market.quote_mint.key().as_ref(),
        &market.collateral_mint.key().as_ref(),
        &market.ltv_factor.to_le_bytes(),
        &market.oracle.id.to_bytes(),
      ],
      bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    // account can be uninitialized, can't be optional, perform manual validation
    /// CHECK: this account must be passed but could be uninitialized
    pub lender_shares: AccountInfo<'info>,
}

impl<'info> ViewMarketWithLenderShares<'info> {
    /// Returns the expected supply assets balance of a user after having accrued interest
    /// Warning: Wrong for fee_recipient because their supply shares increase is not taken into account
    /// Warning: Withdrawing using expected supply assets can lead to error due to rounding
    pub fn expected_supply_assets(
        ctx: Context<ViewMarketWithLenderShares<'info>>,
        args: ViewMarketWithLenderSharesArgs,
    ) -> Result<u64> {
        let ViewMarketWithLenderShares { market, config, lender_shares } = ctx.accounts;

        validate_lender_shares(&lender_shares, &market.to_account_info(), &args.owner)?;

        // If lender shares account is not initialized, lender has no assets
        if lender_shares.data_is_empty() {
            return Ok(0);
        }

        let lender_shares_account = get_lender_shares_data(&lender_shares)?;

        let (total_deposits, total_shares, _, _) = expected_market_balances(&market, &config)?;
        to_assets_down(lender_shares_account.shares, total_deposits, total_shares)
    }
}

pub fn get_lender_shares_data(lender_shares: &AccountInfo) -> Result<LenderShares> {
  let lender_shares_data = lender_shares.try_borrow_data()?;
  let lender_shares_account = LenderShares::try_deserialize(&mut &lender_shares_data[..])?;
  Ok(lender_shares_account)
}

pub fn validate_lender_shares(
  lender_shares: &AccountInfo,
  pathfinder_market: &AccountInfo,
  owner: &Pubkey,
) -> Result<()> {

  // 1. Check program ownership
  if !lender_shares.data_is_empty() {
    require!(
        lender_shares.owner == &crate::ID,
        MarketError::InvalidAccountOwner
    );
  }

  // 2. Validate seed derivation
  let expected_lender_shares = Pubkey::find_program_address(
      &[
          MARKET_SHARES_SEED_PREFIX,
          pathfinder_market.key().as_ref(),
          owner.as_ref(),
      ],
      &crate::ID
  ).0;
 
  require!(
      lender_shares.key() == expected_lender_shares,
      MarketError::InvalidAccountSeeds
  );

  Ok(())
}
