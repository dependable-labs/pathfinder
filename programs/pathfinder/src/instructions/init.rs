use anchor_lang::prelude::*;

use crate::error::MarketError;
use crate::state::*;
use crate::traits::authority::AuthorityProtection;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitArgs {
    pub new_authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitArgs)]
pub struct Init<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
      init,
      payer = user,
      space = 8 + std::mem::size_of::<Config>(),
      seeds = [CONFIG_SEED_PREFIX],
      bump,
    )]
    pub config: Box<Account<'info, Config>>,
    pub system_program: Program<'info, System>,
}

impl<'info> Init<'info> {
    pub fn validate(&self, args: &InitArgs) -> Result<()> {
        require!(
            args.new_authority != Pubkey::default(),
            MarketError::InvalidAuthority
        );

        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: InitArgs) -> Result<()> {
        let Init { config, .. } = ctx.accounts;

        if config.authority != Pubkey::default() {
            return Err(MarketError::ProgramAlreadyInitialized.into());
        }

        config.set_inner(Config {
            authority: args.new_authority,
            fee_factor: 0,
            fee_recipient: Pubkey::default(),
            bump: ctx.bumps.config,
        });

        Ok(())
    }
}
