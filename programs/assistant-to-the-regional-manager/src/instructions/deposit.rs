use anchor_lang::prelude::*;
use anchor_spl::token::*;
use pathfinder::{
    state::Config,
    program::Pathfinder,
};

use crate::{
    state::*,
    traits::{
        curator::CuratorProtection,
        vault_accounting::VaultAccounting,
        path_actions::PathActions,
    },
    error::*
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositArgs {
    pub assets: u64,
    pub receiver: Pubkey
}

#[derive(Accounts)]
#[instruction(args: DepositArgs)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    // #[account(
    //     mut,
    // )]
    // pub receiver: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [
            MANAGER_CONFIG_SEED_PREFIX,
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
            MANAGER_QUEUE_SEED_PREFIX,
            config.key().as_ref(),
        ],
        bump = queue.bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,
 
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<SupplyShares>(),
        seeds = [
            MANAGER_SHARES_SEED_PREFIX,
            &config.key().as_ref(),
            &config.fee_recipient.key().as_ref()
        ],
        bump
    )]
    pub fee_recipient_shares: Account<'info, SupplyShares>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<SupplyShares>(),
        seeds = [
            MANAGER_SHARES_SEED_PREFIX,
            &config.key().as_ref(),
            &args.receiver.key().as_ref()
        ],
        bump
    )]
    pub receiver_shares: Account<'info, SupplyShares>,

    // pathfinder accounts
    pub pathfinder_config: Account<'info, Config>,
    pub vault_ata_quote: Account<'info, TokenAccount>,
    pub user_ata_quote: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub pathfinder_program: Program<'info, Pathfinder>,

    // NOTE: remaining accounts are pathfinder market and lender shares accounts.
    // These are not specified here but are passed in the context
    // the accounts are in threes [market, lender_shares, market_config, ...]
}

impl<'info> CuratorProtection<'info> for Deposit<'info> {}
impl<'info, 'c: 'info> VaultAccounting<'info, 'c> for Deposit<'info> {}
impl<'info, 'c: 'info> PathActions<'info, 'c> for Deposit<'info> {}
impl<'info, 'c: 'info> Deposit<'info> {

    pub fn validate(&self, args: &DepositArgs) -> Result<()> {
        self.is_curator(&self.user, &self.config)?;
        Ok(())
    }

    pub fn handle(ctx: Context<'_, '_, 'c, 'info, Deposit<'info>>, args: DepositArgs) -> Result<()> {

        let (fee_shares, new_total_assets) = Self::_accrued_fee_shares(&ctx)?;

        // let Deposit {
        //     user,
        //     config,
        //     fee_recipient_shares,
        //     receiver_shares,
        //     queue,
        //     pathfinder_config,
        //     pathfinder_program,
        //     vault_ata_quote,
        //     user_ata_quote,
        //     token_program,
        //     system_program,
        //     ..
        // } = ctx.accounts;

        let mut assets = args.assets;

        if fee_shares != 0 {
            ctx.accounts.fee_recipient_shares.shares = ctx.accounts.fee_recipient_shares.shares
                .checked_add(fee_shares)
                .ok_or(ManagerError::MathOverflow)?;
        } 

        // Update `lastTotalAssets` to avoid an inconsistent state in a re-entrant context.
        // It is updated again in `_deposit`.
        ctx.accounts.config.last_total_assets = new_total_assets;

        let shares = Self::_convert_to_shares_with_totals(
            args.assets, 
            ctx.accounts.config.total_shares,
            new_total_assets,
            ctx.accounts.config.decimals_offset,
            false
        )?;

        // Supply assets to Pathfinder markets
        Self::_supply_path(
            &ctx,
            &mut assets,
            // user,
            // config,
            // queue,
            // pathfinder_config,
            // pathfinder_program,
            // vault_ata_quote,
            // user_ata_quote,
            // token_program,
            // system_program,
            // remaining_accounts
        )?;

        ctx.accounts.receiver_shares.shares = ctx.accounts.receiver_shares.shares
            .checked_add(shares)
            .ok_or(ManagerError::MathOverflow)?;

        // Update last total assets
        ctx.accounts.config.last_total_assets = ctx.accounts.config.last_total_assets
            .checked_add(args.assets)
            .ok_or(ManagerError::MathOverflow)?;

        Ok(())
    }
}


// /// Supplies `assets` to Morpho.
// fn _supply_path(
//     assets: u64,
//     config: &Account<'info, ManagerVaultConfig>,
//     queue: &Account<'info, QueueState>,
//     pathfinder_config: &Account<'info, Config>,
//     pathfinder_program: &Program<'info, Pathfinder>,
//     token_program: &Program<'info, Token>,
// ) -> Result<()> {
//     for (uint256 i; i < supplyQueue.length; ++i) {
//         Id id = supplyQueue[i];

//             uint256 supplyCap = config[id].cap;
//             if (supplyCap == 0) continue;

//             MarketParams memory marketParams = _marketParams(id);

//             MORPHO.accrueInterest(marketParams);

//             Market memory market = MORPHO.market(id);
//             uint256 supplyShares = MORPHO.supplyShares(id, address(this));
//             // `supplyAssets` needs to be rounded up for `toSupply` to be rounded down.
//             uint256 supplyAssets = supplyShares.toAssetsUp(market.totalSupplyAssets, market.totalSupplyShares);

//             uint256 toSupply = UtilsLib.min(supplyCap.zeroFloorSub(supplyAssets), assets);

//             if (toSupply > 0) {
//                 // Using try/catch to skip markets that revert.
//                 try MORPHO.supply(marketParams, toSupply, 0, address(this), hex"") {
//                     assets -= toSupply;
//                 } catch {}
//             }

//             if (assets == 0) return;
//         }

//         if (assets != 0) revert ErrorsLib.AllCapsReached();
//     }
    