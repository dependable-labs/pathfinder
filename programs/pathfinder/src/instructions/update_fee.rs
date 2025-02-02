use anchor_lang::prelude::*;

use crate::state::*;
use crate::error::MarketError;
use crate::traits::authority::AuthorityProtection;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateFeeArgs {
    pub new_fee_factor: u128,
}

#[derive(Accounts)]
#[instruction(args: UpdateFeeArgs)]
pub struct UpdateFee<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<Config>(),
        seeds = [CONFIG_SEED_PREFIX],
        bump,
    )]
    pub config: Box<Account<'info, Config>>,
    pub system_program: Program<'info, System>,
}

impl<'info> AuthorityProtection<'info> for UpdateFee<'info> {}

impl<'info> UpdateFee<'info> {
    pub fn validate(&self, args: &UpdateFeeArgs) -> Result<()> {
        self.is_authority(&self.user, &self.config)?;

        require!(
            args.new_fee_factor <= MAX_FEE_FACTOR,
            MarketError::FeeExceedsMax
        );

        require!(
            args.new_fee_factor != self.config.fee_factor,
            MarketError::FeeAlreadySet
        );

        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: UpdateFeeArgs) -> Result<()> {
        let UpdateFee {
            config,
            ..
        } = ctx.accounts;

        config.fee_factor = args.new_fee_factor;

        Ok(())
    }
}