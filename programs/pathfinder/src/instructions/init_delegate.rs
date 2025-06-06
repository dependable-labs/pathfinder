use crate::state::{PositionDelegate, DELEGATE_SEED_PREFIX};
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitDelegateArgs {
    pub new_delegate: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitDelegateArgs)]
pub struct InitDelegate<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    // position delegate
    #[account(
      init,
      payer = user,
      space = 8 + std::mem::size_of::<PositionDelegate>(),
      seeds = [
        DELEGATE_SEED_PREFIX,
        user.key().as_ref(),
      ],
      bump
    )]
    pub position_delegate: Box<Account<'info, PositionDelegate>>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitDelegate<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: InitDelegateArgs) -> Result<()> {
        let InitDelegate {
            position_delegate, ..
        } = ctx.accounts;

        position_delegate.set_inner(PositionDelegate {
            delegate: args.new_delegate,
            bump: ctx.bumps.position_delegate,
        });

        Ok(())
    }
}
