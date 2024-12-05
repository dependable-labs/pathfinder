use anchor_lang::prelude::*;

use crate::state::*;
use crate::error::MarketError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetAuthorityArgs {
    pub new_authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: SetAuthorityArgs)]
pub struct SetAuthority<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<Controller>(),
        seeds = [CONTROLLER_SEED_PREFIX],
        bump,
    )]
    pub controller: Box<Account<'info, Controller>>,
    pub system_program: Program<'info, System>,
}

impl<'info> SetAuthority<'info> {
    pub fn validate(&self) -> Result<()> {
        require!(
            !self.controller.authority_set,
            MarketError::AuthorityAlreadySet
        );
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: SetAuthorityArgs) -> Result<()> {
        let SetAuthority {
            controller,
            ..
        } = ctx.accounts;

        controller.set_inner(Controller {
            bump: ctx.bumps.controller,
            authority_set: true,
            authority: args.new_authority,
        });

        Ok(())
    }
}