use anchor_lang::prelude::*;
use crate::state::*;
use crate::traits::curator_or_guardian::CuratorOrGuardianProtection;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RevokePendingCapArgs {
    pub market_id: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: RevokePendingCapArgs)]
pub struct RevokePendingCap<'info> {
    pub user: Signer<'info>,

    #[account(
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
            MANAGER_MARKET_CONFIG_SEED_PREFIX,
            config.key().as_ref(),
            args.market_id.as_ref(),
        ],
        bump,
    )]
    pub manager_market_config: Box<Account<'info, ManagerMarketConfig>>,
}

impl<'info> CuratorOrGuardianProtection<'info> for RevokePendingCap<'info> {}

impl<'info> RevokePendingCap<'info> {

    pub fn validate(&self, args: &RevokePendingCapArgs) -> Result<()> {
        self.is_curator_or_guardian(&self.user, &self.config)?;
        Ok(())
    }

    pub fn handle(ctx: Context<RevokePendingCap>, args: RevokePendingCapArgs) -> Result<()> {
        let RevokePendingCap {
            manager_market_config,
            ..
        } = ctx.accounts;

        manager_market_config.pending_cap.value = 0;
        manager_market_config.pending_cap.valid_at = 0;

        Ok(())
    }
}