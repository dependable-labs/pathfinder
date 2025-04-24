use anchor_lang::prelude::*;
use anchor_spl::token::*;
use pathfinder::{
    // math::{zero_floor_sub, WAD},
    // state::Market,
    state::Config,
    program::Pathfinder,
};

use crate::state::*;
use crate::traits::curator::CuratorProtection;

use crate::traits::vault_accounting::VaultAccounting;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositArgs {
    pub assets: u64,
}

#[derive(Accounts)]
#[instruction(args: DepositArgs)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
    )]
    pub receiver: AccountInfo<'info>,

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

    /// CHECK: recipient matches the config.fee_recipient
    #[account(
        constraint = fee_recipient.key() == config.fee_recipient
    )]
    pub fee_recipient: AccountInfo<'info>,

    #[account(
        constraint = shares_mint.key() == config.shares_mint
    )]
    pub shares_mint: Account<'info, Mint>,

    // pathfinder config
    pub pathfinder_config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub pathfinder_program: Program<'info, Pathfinder>,

    // NOTE: remaining accounts are pathfinder market and lender shares accounts.
    // These are not specified here but are passed in the context
    // the accounts are everyother [market, lender shares, market, lender shares, ...] account in the withdraw queue
}

impl<'info> CuratorProtection<'info> for Deposit<'info> {}
impl<'info, 'c: 'info> VaultAccounting<'info, 'c> for Deposit<'info> {}
impl<'info, 'c: 'info> Deposit<'info> {

    pub fn validate(&self, args: &DepositArgs) -> Result<()> {
        self.is_curator(&self.user, &self.config)?;
        Ok(())
    }

    pub fn handle(ctx: Context<'_, '_, 'c, 'info, Deposit<'info>>, args: DepositArgs) -> Result<()> {

        let new_total_assets = Self::_accrue_fee(&ctx)?;

        let Deposit {
            config,
            // market,
            queue,
            token_program,
            receiver,
            fee_recipient,
            shares_mint,
            pathfinder_config,
            ..
        } = ctx.accounts;

        // Update `lastTotalAssets` to avoid an inconsistent state in a re-entrant context.
        // It is updated again in `_deposit`.
        config.last_total_assets = new_total_assets;

        let shares = Self::_convert_to_shares_with_totals(
            args.assets, 
            shares_mint.supply,
            new_total_assets,
            config.decimals_offset,
            false
        );

        // Self::_deposit(ctx, args.assets, shares);

        Ok(())
    }
}


    
    // @inheritdoc ERC4626
    // @dev Used in mint or deposit to deposit the underlying asset to Morpho markets.
    // pub fn _deposit(caller: Pubkey, receiver: Pubkey, assets: u64, shares: u64) -> Result<()> {
    //     super._deposit(caller, receiver, assets, shares);

    //     _supplyPath(assets);

    //     // `lastTotalAssets + assets` may be a little off from `totalAssets()`.
    //     _updateLastTotalAssets(lastTotalAssets + assets);
    // }


    // @dev Supplies `assets` to Pathfinder.
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



    