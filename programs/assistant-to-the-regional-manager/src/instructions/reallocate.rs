// Standard Anchor/SPL imports
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

// Pathfinder imports
use pathfinder::{
    cpi::deposit,
    instructions::views::supply_balances::{get_lender_shares_data, validate_lender_shares},
    program::Pathfinder,
    state::{Config, LenderShares, Market, MARKET_SEED_PREFIX, MARKET_SHARES_SEED_PREFIX},
};

// Local imports
use crate::{
    error::ManagerError,
    generate_manager_config_seeds,
    state::{
        AllocatorState, ManagerMarketConfig, ManagerVaultConfig, QueueState,
        MANAGER_ALLOCATOR_SEED_PREFIX, MANAGER_CONFIG_SEED_PREFIX,
        MANAGER_MARKET_CONFIG_SEED_PREFIX, MANAGER_QUEUE_SEED_PREFIX,
    },
    traits::{allocator::AllocatorProtection, path_actions::PathActions},
    utils::accounts::validate_manager_market_config_pda,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ReallocateArgs {
    pub withdraw_amount: u64,
    pub supply_amounts: Vec<u64>,
}

#[derive(Accounts)]
#[instruction(args: ReallocateArgs)]
pub struct Reallocate<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [
            MANAGER_ALLOCATOR_SEED_PREFIX,
            manager_config.key().as_ref(),
            user.key().as_ref(),
        ],
        bump,
    )]
    pub allocator: Option<Account<'info, AllocatorState>>,

    #[account(
        mut,
        seeds = [
            MANAGER_CONFIG_SEED_PREFIX,
            quote_mint.key().as_ref(),
            manager_config.symbol.as_bytes(),
            manager_config.name.as_bytes(),
        ],
        bump = manager_config.bump,
    )]
    pub manager_config: Box<Account<'info, ManagerVaultConfig>>,

    #[account(
        mut,
        seeds = [
            MANAGER_MARKET_CONFIG_SEED_PREFIX,
            manager_config.key().as_ref(),
            pathfinder_market.key().as_ref(),
        ],
        bump, // TODO: Should be manager_market_config.bump?
    )]
    pub manager_market_config: Box<Account<'info, ManagerMarketConfig>>,

    #[account(constraint = quote_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,

    // temporarily holds funds for reallocation
    #[account(
      init_if_needed,
      payer = user,
      associated_token::authority = manager_config,
      associated_token::mint = quote_mint
    )]
    pub manager_ata_quote: Box<Account<'info, TokenAccount>>,

    // pathfinder accounts
    #[account(
      mut,
      seeds = [
        MARKET_SEED_PREFIX,
        &pathfinder_market.quote_mint.key().as_ref(),
        &pathfinder_market.collateral_mint.key().as_ref(),
        &pathfinder_market.ltv_factor.to_le_bytes(),
        &pathfinder_market.oracle.id.to_bytes(),
      ],
      bump = pathfinder_market.bump,
      seeds::program = pathfinder_program.key(),
    )]
    pub pathfinder_market: Account<'info, Market>,

    #[account(
      mut,
      seeds = [
        MARKET_SHARES_SEED_PREFIX,
        &pathfinder_market.key().as_ref(),
        manager_config.key().as_ref(),
      ],
      bump,
      seeds::program = pathfinder_program.key(),
    )]
    pub lender_shares: Box<Account<'info, LenderShares>>,

    #[account(mut)]
    pub pathfinder_config: Box<Account<'info, Config>>,
    pub pathfinder_program: Program<'info, Pathfinder>,
    #[account(mut)]
    pub vault_ata_quote: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    // NOTE: remaining accounts are pathfinder market, lender shares, and manager market config accounts.
    // These are not specified here but are passed in the context
    // the accounts are ordered in threes [market, lender_shares, manager_market_config, ...] but are not ordered by a queue
}

impl<'info> AllocatorProtection<'info> for Reallocate<'info> {}
impl<'info, 'c: 'info> PathActions<'info, 'c> for Reallocate<'info> {}

impl<'info, 'c: 'info> Reallocate<'info> {
    pub fn validate(&self) -> Result<()> {
        self.is_allocator(&self.user, &self.manager_config, self.allocator.as_ref())?;
        Ok(())
    }

    pub fn handle(ctx: Context<'_, '_, 'c, 'info, Self>, args: ReallocateArgs) -> Result<()> {
        let accounts = ctx.accounts;

        // Step 1: Validate and withdraw from source market
        let total_withdrawn = Self::process_withdrawal(&accounts, &args)?;

        // Step 2: Process deposits to target markets
        Self::process_deposits(
            &args.supply_amounts,
            total_withdrawn,
            &accounts,
            ctx.remaining_accounts,
        )?;

        Ok(())
    }

    fn process_withdrawal(accounts: &Reallocate<'info>, args: &ReallocateArgs) -> Result<u64> {
        let supply_assets = Self::_accrued_supply_balance(
            &accounts.user,
            &accounts.pathfinder_market,
            accounts.lender_shares.shares,
            &accounts.pathfinder_config,
            &accounts.pathfinder_program,
        )?;

        require!(
            supply_assets > args.withdraw_amount,
            ManagerError::NotEnoughLiquidity
        );
        require!(
            accounts.manager_market_config.enabled,
            ManagerError::MarketNotEnabled
        );

        Self::process_market_withdrawal(
            args.withdraw_amount,
            &accounts.user,
            &accounts.manager_config.to_account_info(),
            &accounts.manager_config,
            &accounts.pathfinder_market,
            &accounts.lender_shares,
            &accounts.pathfinder_config,
            &accounts.pathfinder_program,
            &accounts.vault_ata_quote,
            &accounts.quote_mint,
            &accounts.manager_ata_quote,
            &accounts.token_program,
            &accounts.system_program,
            &accounts.associated_token_program,
        )
    }

    fn process_deposits(
        supply_amounts: &[u64],
        mut total_withdrawn: u64,
        accounts: &Reallocate<'info>,
        remaining_accounts: &'info [AccountInfo<'info>],
    ) -> Result<()> {
        require!(
            remaining_accounts.len() / 3 == supply_amounts.len(),
            ManagerError::ReallocateAccountMismatch
        );

        let mut amount_index = 0;
        for i in (0..remaining_accounts.len()).step_by(3) {
            let market_info = &remaining_accounts[i];
            let lender_shares_info = &remaining_accounts[i + 1];
            let manager_market_config_info = &remaining_accounts[i + 2];
            let supply_amount = supply_amounts[amount_index];

            let deposited = Self::process_single_deposit(
                accounts,
                market_info,
                lender_shares_info,
                manager_market_config_info,
                supply_amount,
                total_withdrawn,
            )?;

            total_withdrawn = total_withdrawn
                .checked_sub(deposited)
                .ok_or(ManagerError::MathUnderflow)?;

            amount_index += 1;
        }

        require!(total_withdrawn == 0, ManagerError::InconsistentReallocation);

        Ok(())
    }

    fn process_single_deposit(
        accounts: &Reallocate<'info>,
        market_info: &AccountInfo<'info>,
        lender_shares_info: &AccountInfo<'info>,
        manager_market_config_info: &'info AccountInfo<'info>,
        supply_amount: u64,
        total_withdrawn: u64,
    ) -> Result<u64> {
        // Validate accounts and get supply cap
        let (shares, supply_cap) = Self::validate_deposit_accounts(
            lender_shares_info,
            market_info,
            manager_market_config_info,
            &accounts.manager_config,
        )?;

        // Calculate supply amount and validate against cap
        let supply_assets = Self::_accrued_supply_balance(
            &accounts.user,
            &accounts.pathfinder_market,
            shares,
            &accounts.pathfinder_config,
            &accounts.pathfinder_program,
        )?;

        let supplied_assets = if supply_amount == u64::MAX {
            total_withdrawn
        } else {
            supply_amount
        };

        let new_total_supply = supply_assets
            .checked_add(supplied_assets)
            .ok_or(ManagerError::MathOverflow)?;

        require!(
            new_total_supply <= supply_cap,
            ManagerError::SupplyCapExceeded
        );

        // Execute deposit
        let deposited =
            Self::execute_deposit(accounts, market_info, lender_shares_info, supplied_assets)?;

        Ok(deposited)
    }

    fn validate_deposit_accounts(
        lender_shares_info: &AccountInfo<'info>,
        market_info: &AccountInfo<'info>,
        manager_market_config_info: &'info AccountInfo<'info>,
        manager_config: &Account<'info, ManagerVaultConfig>,
    ) -> Result<(u64, u64)> {
        validate_lender_shares(lender_shares_info, market_info, &manager_config.key())?;

        let shares = if lender_shares_info.data_is_empty() {
            0
        } else {
            get_lender_shares_data(lender_shares_info)?.shares
        };

        let manager_market_config_account =
            Account::<ManagerMarketConfig>::try_from(&manager_market_config_info)?;

        validate_manager_market_config_pda(
            &manager_market_config_info.key(),
            &market_info.key(),
            &manager_config.key(),
        )?;

        let supply_cap = manager_market_config_account.cap;
        require!(supply_cap > 0, ManagerError::UnauthorizedMarket);

        Ok((shares, supply_cap))
    }

    fn execute_deposit(
        accounts: &Reallocate<'info>,
        market_info: &AccountInfo<'info>,
        lender_shares_info: &AccountInfo<'info>,
        supplied_assets: u64,
    ) -> Result<u64> {
        let seeds = generate_manager_config_seeds!(accounts.manager_config);
        let signer = &[&seeds[..]];

        let deposit_ctx = CpiContext::new_with_signer(
            accounts.pathfinder_program.to_account_info(),
            pathfinder::cpi::accounts::Deposit {
                user: accounts.manager_config.to_account_info(),
                market: market_info.to_account_info(),
                config: accounts.pathfinder_config.to_account_info(),
                lender_shares: lender_shares_info.to_account_info(),
                vault_ata_quote: accounts.vault_ata_quote.to_account_info(),
                user_ata_quote: accounts.manager_ata_quote.to_account_info(),
                token_program: accounts.token_program.to_account_info(),
                system_program: accounts.system_program.to_account_info(),
            },
            signer,
        );

        let deposit_args: pathfinder::instructions::DepositArgs =
            pathfinder::instructions::DepositArgs {
                amount: supplied_assets,
                shares: 0,
                owner: accounts.manager_config.key(),
            };

        if deposit(deposit_ctx, deposit_args).is_ok() {
            Ok(supplied_assets)
        } else {
            Ok(0)
        }
    }
}
