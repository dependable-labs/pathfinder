use anchor_lang::prelude::*;
use anchor_spl::token::*;
use pathfinder::state::Market;
use pathfinder::state::MARKET_SEED_PREFIX;

use crate::state::*;
use crate::error::*;
use crate::traits::curator::CuratorProtection;
use pathfinder::math::utils::*;

use crate::utils::shares::_mint;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositArgs {
    pub receiver: Pubkey,
    pub assets: u64,
}

#[derive(Accounts)]
#[instruction(args: DepositArgs)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [
            CONFIG_SEED_PREFIX,
            config.quote_mint.as_ref(),
            config.symbol.as_bytes(),
            config.name.as_bytes(),
        ],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ManagerVaultConfig>>,
    
    #[account(
        mut,
        seeds = [
            QUEUE_SEED_PREFIX,
            config.key().as_ref(),
        ],
        bump = queue.bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    // #[account(
    //     init_if_needed,
    //     payer = user,
    //     space = 8 + std::mem::size_of::<MarketConfig>(),
    //     seeds = [
    //         MARKET_CONFIG_SEED_PREFIX,
    //         config.key().as_ref(),
    //         args.market_id.as_ref(),
    //     ],
    //     bump,
    // )]
    // pub market_config: Box<Account<'info, MarketConfig>>,

    #[account(
        constraint = recipient.key() == config.fee_recipient
    )]
    pub recipient: AccountInfo<'info>,

    #[account(
        constraint = shares_mint.key() == config.shares_mint
    )]
    pub shares_mint: Account<'info, Mint>,

    // errors if market account is not initialized
    #[account(
        owner = PATHFINDER_PROGRAM_ID,
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

impl<'info> CuratorProtection<'info> for Deposit<'info> {}

impl<'info> Deposit<'info> {

    pub fn validate(&self, args: &DepositArgs) -> Result<()> {
        self.is_curator(&self.user, &self.config)?;
        Ok(())
    }

    pub fn handle(ctx: Context<Deposit>, args: DepositArgs) -> Result<()> {
        let Deposit {
            config,
            market,
            queue,
            token_program,
            recipient,
            shares_mint,
            ..
        } = ctx.accounts;

        let new_total_assets = _accrue_fee(
            &shares_mint,
            &config,
            &recipient,
            &token_program,
        )?;

        // Update `lastTotalAssets` to avoid an inconsistent state in a re-entrant context.
        // It is updated again in `_deposit`.
        config.last_total_assets = new_total_assets;

        // let shares = _convert_to_shares_with_totals(args.assets, total_supply, new_total_assets, Math.Rounding.Floor);

        // _deposit(ctx.accounts.user.key(), args.receiver, args.assets, shares);

        Ok(())
    }
}
    
    /// @inheritdoc ERC4626
    /// @dev Used in mint or deposit to deposit the underlying asset to Morpho markets.
    // pub fn _deposit(caller: Pubkey, receiver: Pubkey, assets: u64, shares: u64) -> Result<()> {
    //     super._deposit(caller, receiver, assets, shares);

    //     _supplyPath(assets);

    //     // `lastTotalAssets + assets` may be a little off from `totalAssets()`.
    //     _updateLastTotalAssets(lastTotalAssets + assets);
    // }


    /// @dev Supplies `assets` to Pathfinder.
    // pub fn _supply_path(assets: u64) -> Result<()> {
    //     for (uint256 i; i < supplyQueue.length; ++i) {
    //         Id id = supplyQueue[i];

    //         uint256 supplyCap = config[id].cap;
    //         if (supplyCap == 0) continue;

    //         MarketParams memory marketParams = _marketParams(id);

    //         MORPHO.accrueInterest(marketParams);

    //         Market memory market = MORPHO.market(id);
    //         uint256 supplyShares = MORPHO.supplyShares(id, address(this));
    //         // `supplyAssets` needs to be rounded up for `toSupply` to be rounded down.
    //         uint256 supplyAssets = supplyShares.toAssetsUp(market.totalSupplyAssets, market.totalSupplyShares);

    //         uint256 toSupply = UtilsLib.min(supplyCap.zeroFloorSub(supplyAssets), assets);

    //         if (toSupply > 0) {
    //             // Using try/catch to skip markets that revert.
    //             try MORPHO.supply(marketParams, toSupply, 0, address(this), hex"") {
    //                 assets -= toSupply;
    //             } catch {}
    //         }

    //         if (assets == 0) return;
    //     }

    //     if (assets != 0) revert ErrorsLib.AllCapsReached();
    // }


    /// @dev Accrues the fee and mints the fee shares to the fee recipient.
    /// @return newTotalAssets The vaults total assets after accruing the interest.
    pub fn _accrue_fee<'info>(
        mint_shares: &Account<'info, Mint>,
        manager_config: &Account<'info, ManagerVaultConfig>, 
        recipient: &AccountInfo<'info>,
        token_program: &Program<'info, Token>,
    ) -> Result<()> {
        let fee_shares: u64;
        let new_total_assets: u64;
        (fee_shares, new_total_assets) = _accrued_fee_shares(manager_config)?;

        if fee_shares != 0 {
            _mint(mint_shares,
                recipient,
                token_program,
                manager_config,
                fee_shares,
            )?;
        }

        Ok(())
    }

    /// @dev Computes and returns the fee shares (`feeShares`) to mint and the new vault's total assets
    /// (`newTotalAssets`).
    pub fn _accrued_fee_shares(manager_config: &ManagerVaultConfig) -> Result<(u64, u64)> {
        let new_total_assets = total_assets()?;
        let fee_shares: u64;

        let total_interest = zero_floor_sub(new_total_assets, manager_config.last_total_assets)?;

        if total_interest != 0 && manager_config.fee != 0 {
            // It is acknowledged that `fee_assets` may be rounded down to 0 if `total_interest * fee < WAD`.
            let fee_assets = total_interest.mul_div(manager_config.fee, WAD);

            // The fee assets is subtracted from the total assets in this calculation to compensate for the fact
            // that total assets is already increased by the total interest (including the fee assets).
            fee_shares =
                _convert_to_shares_with_totals(fee_assets, total_supply(), new_total_assets - fee_assets, Math.Rounding.Floor);
        }

        Ok((fee_shares, new_total_assets))
    }

    /// @dev Returns the amount of shares that the vault would exchange for the amount of `assets` provided.
    /// @dev It assumes that the arguments `newTotalSupply` and `newTotalAssets` are up to date.
    pub fn _convert_to_shares_with_totals(
        assets: u64,
        new_total_supply: u64,
        new_total_assets: u64,
        rounding: Math.Rounding
    ) -> Result<u64> {
        Ok(assets.mul_div(new_total_supply + 10 ** _decimals_offset(), new_total_assets + 1, rounding))
    }


        /// @inheritdoc IERC4626
    pub fn total_assets() -> Result<u64> {
        let mut assets = 0;
        for i in 0..withdraw_queue.len() {
            assets += MORPHO.expected_supply_assets(_market_params(withdraw_queue[i]), address(this));
        }

        Ok(assets)
    }
    