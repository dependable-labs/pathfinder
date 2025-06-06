use anchor_lang::prelude::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitLenderSharesArgs {
    pub owner: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitLenderSharesArgs)]
pub struct InitLenderShares<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED_PREFIX],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

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
    pub market: Box<Account<'info, Market>>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<LenderShares>(),
        seeds = [
            MARKET_SHARES_SEED_PREFIX,
            market.key().as_ref(),
            args.owner.key().as_ref()
        ],
        bump
    )]
    pub lender_shares: Box<Account<'info, LenderShares>>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitLenderShares<'info> {
    pub fn handle(ctx: Context<Self>, args: InitLenderSharesArgs) -> Result<()> {
        Ok(())
    }
}