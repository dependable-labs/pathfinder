use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SubmitMarketRemovalArgs {
    pub market_id: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: SubmitMarketRemovalArgs)]
pub struct SubmitMarketRemoval<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

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
        bump,
    )]
    pub queue: Box<Account<'info, QueueState>>,

    #[account(
        mut,
        seeds = [
            MANAGER_MARKET_CONFIG_SEED_PREFIX,
            config.key().as_ref(),
            args.market_id.as_ref(),
        ],
        bump,
    )]
    pub market_config: Box<Account<'info, MarketConfig>>,

    pub system_program: Program<'info, System>,
}

impl<'info> SubmitMarketRemoval<'info> {

    pub fn validate(&self, args: &SubmitMarketRemovalArgs) -> Result<()> {
        let SubmitMarketRemoval {
            market_config,
            ..
        } = self;

        require!(
            market_config.removable_at == 0,
            ManagerError::AlreadyPending
        );

        require!(
            market_config.cap == 0,
            ManagerError::NonZeroCap
        );

        require!(
            market_config.enabled,
            ManagerError::MarketNotEnabled
        );

        require!(
            market_config.pending_cap.valid_at == 0,
            ManagerError::PendingCap
        );

        Ok(())
    }


    pub fn handle(ctx: Context<SubmitMarketRemoval>, args: SubmitMarketRemovalArgs) -> Result<()> {
        let SubmitMarketRemoval {
            market_config,
            queue,
            config,
            ..
        } = ctx.accounts;

        // Set the removableAt
        let current_timestamp = Clock::get()?.unix_timestamp as u64;
        market_config.removable_at = current_timestamp
            .checked_add(config.timelock)
            .ok_or(ManagerError::MathOverflow)?;

        Ok(())
    }
}