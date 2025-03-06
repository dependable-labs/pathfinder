use anchor_lang::prelude::*;
use crate::instructions::submit_cap::set_cap;
use crate::state::*;
use crate::error::*;
use crate::instructions::timelock::after_timelock;

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
        bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    #[account(
        mut,
        seeds = [
            MARKET_CONFIG_SEED_PREFIX,
            config.key().as_ref(),
            args.market_id.as_ref(),
        ],
        bump,
    )]
    pub market_config: Box<Account<'info, MarketConfig>>,

    pub system_program: Program<'info, System>,
}

impl<'info> AcceptCap<'info> {
    pub fn handle(ctx: Context<AcceptCap>, args: AcceptCapArgs) -> Result<()> {
        let AcceptCap {
            market_config,
            queue,
            ..
        } = ctx.accounts;

        after_timelock(market_config.pending_cap.valid_at)?;

        // Set the new cap
        let pending_cap = market_config.pending_cap.value;
        set_cap(queue, market_config, args.market_id, pending_cap)?;

        Ok(())
    }
}