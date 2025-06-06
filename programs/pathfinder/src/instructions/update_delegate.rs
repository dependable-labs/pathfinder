use crate::state::{PositionDelegate, DELEGATE_SEED_PREFIX};
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateDelegateArgs {
    pub new_delegate: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: UpdateDelegateArgs)]
pub struct UpdateDelegate<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    // position delegate
    #[account(
      mut,
      seeds = [
        DELEGATE_SEED_PREFIX,
        user.key().as_ref(),
      ],
      bump = position_delegate.bump
    )]
    pub position_delegate: Box<Account<'info, PositionDelegate>>,
}

impl<'info> UpdateDelegate<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: UpdateDelegateArgs) -> Result<()> {
        let UpdateDelegate {
            position_delegate, ..
        } = ctx.accounts;

        position_delegate.delegate = args.new_delegate;

        Ok(())
    }
}
