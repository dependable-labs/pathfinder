use crate::instructions::timelock::after_timelock;
use crate::traits::{guardian::GuardianProtection, owner::OwnerProtection};
use crate::{error::*, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct RevokePendingGuardian<'info> {
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
}

impl<'info> GuardianProtection<'info> for RevokePendingGuardian<'info> {}

impl<'info> RevokePendingGuardian<'info> {
    pub fn validate(&self) -> Result<()> {
        self.is_guardian(&self.user, &self.manager_config)?;
        Ok(())
    }

    pub fn handle(ctx: Context<RevokePendingGuardian>) -> Result<()> {
        let config = &mut ctx.accounts.manager_config;

        config.pending_guardian.value = Pubkey::default();
        config.pending_guardian.valid_at = 0;

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SubmitGuardianArgs {
    pub new_guardian: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: SubmitGuardianArgs)]
pub struct SubmitGuardian<'info> {
    pub user: Signer<'info>,

    // vault
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
}

impl<'info> OwnerProtection<'info> for SubmitGuardian<'info> {}

impl<'info> SubmitGuardian<'info> {
    pub fn validate(&self, args: &SubmitGuardianArgs) -> Result<()> {
        self.is_owner(&self.user, &self.manager_config)?;

        Ok(())
    }

    pub fn handle(ctx: Context<SubmitGuardian>, args: SubmitGuardianArgs) -> Result<()> {
        let config = &mut ctx.accounts.manager_config;

        if args.new_guardian == config.guardian {
            return err!(ManagerError::AlreadySet);
        }

        if config.pending_guardian.valid_at != 0 {
            return err!(ManagerError::AlreadyPending);
        }

        if config.guardian == Pubkey::default() {
            set_guardian(config, args.new_guardian)?;
        } else {
            let timelock = config.timelock;
            config
                .pending_guardian
                .update(args.new_guardian, timelock)?;
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct AcceptGuardian<'info> {
    pub user: Signer<'info>,

    // vault
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
}

impl<'info> AcceptGuardian<'info> {
    pub fn handle(ctx: Context<AcceptGuardian>) -> Result<()> {
        let config = &mut ctx.accounts.manager_config;
        let pending_guardian = config.pending_guardian.value;

        after_timelock(config.pending_guardian.valid_at)?;

        set_guardian(config, pending_guardian)?;

        Ok(())
    }
}

/// Sets the guardian to the new guardian address
pub fn set_guardian(config: &mut ManagerVaultConfig, new_guardian: Pubkey) -> Result<()> {
    config.guardian = new_guardian;

    config.pending_guardian = PendingPubkey {
        value: Pubkey::default(),
        valid_at: 0,
    };

    Ok(())
}
