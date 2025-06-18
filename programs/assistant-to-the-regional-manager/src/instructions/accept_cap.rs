use crate::instructions::submit_cap::set_cap;
use crate::instructions::timelock::after_timelock;
use crate::state::*;
use anchor_lang::prelude::*;
use pathfinder::{
    state::{Market, LenderShares, Config},
    program::Pathfinder,
    state::{MARKET_SEED_PREFIX, MARKET_SHARES_SEED_PREFIX},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AcceptCapArgs {
    pub market_id: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: AcceptCapArgs)]
pub struct AcceptCap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [
            MANAGER_CONFIG_SEED_PREFIX,
            &manager_config.quote_mint.as_ref(),
            &manager_config.symbol.as_bytes(),
            &manager_config.name.as_bytes(),
        ],
        bump = manager_config.bump,
    )]
    pub manager_config: Box<Account<'info, ManagerVaultConfig>>,

    #[account(
        mut,
        seeds = [
            MANAGER_QUEUE_SEED_PREFIX,
            &manager_config.key().as_ref(),
        ],
        bump = queue.bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    #[account(
        mut,
        seeds = [
            MANAGER_MARKET_CONFIG_SEED_PREFIX,
            &manager_config.key().as_ref(),
            &args.market_id.as_ref(),
        ],
        bump,
    )]
    pub manager_market_config: Box<Account<'info, ManagerMarketConfig>>,

    // pathfinder accounts
    #[account(
      mut,
      seeds = [
        MARKET_SHARES_SEED_PREFIX,
        &pathfinder_market.key().as_ref(),
        &manager_config.key().as_ref(),
      ],
      bump,
      seeds::program = pathfinder_program.key(),
    )]
    pub lender_shares: Box<Account<'info, LenderShares>>,

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
    pub pathfinder_config: Account<'info, Config>,
    pub pathfinder_program: Program<'info, Pathfinder>,

    pub system_program: Program<'info, System>,
}

impl<'info> AcceptCap<'info> {
    pub fn handle(ctx: Context<AcceptCap>, args: AcceptCapArgs) -> Result<()> {
        let AcceptCap {
            manager_market_config,
            queue,
            manager_config,
            pathfinder_market,
            lender_shares,
            pathfinder_config,
            pathfinder_program,
            ..
        } = ctx.accounts;

        after_timelock(manager_market_config.pending_cap.valid_at)?;

        // Set the new cap
        let pending_cap = manager_market_config.pending_cap.value;
        set_cap(
            pending_cap,
            args.market_id,
            queue,
            manager_market_config,
            manager_config,
            &pathfinder_market,
            &lender_shares.to_account_info(),
            &pathfinder_config,
            &pathfinder_program,
        )?;

        Ok(())
    }
}
