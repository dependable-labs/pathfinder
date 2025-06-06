use crate::error::ManagerError;
use crate::state::*;
use crate::traits::{guardian::GuardianProtection, owner::OwnerProtection};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct RevokePendingTimelock<'info> {
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
}

impl<'info> GuardianProtection<'info> for RevokePendingTimelock<'info> {}

impl<'info> RevokePendingTimelock<'info> {
    pub fn validate(&self) -> Result<()> {
        self.is_guardian(&self.user, &self.config)?;

        Ok(())
    }

    pub fn handle(ctx: Context<RevokePendingTimelock>) -> Result<()> {
        let config = &mut ctx.accounts.config;

        config.pending_timelock.value = 0;
        config.pending_timelock.valid_at = 0;

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SubmitTimelockArgs {
    pub new_timelock: u64,
}

#[derive(Accounts)]
#[instruction(args: SubmitTimelockArgs)]
pub struct SubmitTimelock<'info> {
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
}

impl<'info> OwnerProtection<'info> for SubmitTimelock<'info> {}

impl<'info> SubmitTimelock<'info> {
    pub fn validate(&self, args: &SubmitTimelockArgs) -> Result<()> {
        self.is_owner(&self.user, &self.config)?;

        require!(
            args.new_timelock != self.config.timelock,
            ManagerError::AlreadySet
        );

        Ok(())
    }

    pub fn handle(ctx: Context<SubmitTimelock>, args: SubmitTimelockArgs) -> Result<()> {
        let SubmitTimelock { config, .. } = ctx.accounts;

        let current_timelock = config.timelock;

        if config.pending_timelock.valid_at != 0 {
            return err!(ManagerError::AlreadyPending);
        }

        check_timelock_bounds(args.new_timelock)?;

        // If increasing timelock, apply immediately
        if args.new_timelock > current_timelock {
            set_timelock(config, args.new_timelock)?;
        } else {
            config
                .pending_timelock
                .update(args.new_timelock, current_timelock)?;
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct AcceptTimelock<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
      mut,
      seeds = [MANAGER_CONFIG_SEED_PREFIX, config.quote_mint.as_ref(), config.symbol.as_bytes(), config.name.as_bytes()],
      bump = config.bump,
  )]
    pub config: Box<Account<'info, ManagerVaultConfig>>,
}

impl<'info> AcceptTimelock<'info> {
    pub fn handle(ctx: Context<AcceptTimelock>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let pending_timelock = config.pending_timelock.value;

        after_timelock(config.pending_timelock.valid_at)?;

        set_timelock(config, pending_timelock)?;

        Ok(())
    }
}

/// Sets the timelock to the new value
pub fn set_timelock(config: &mut ManagerVaultConfig, new_timelock: u64) -> Result<()> {
    config.timelock = new_timelock;
    config.pending_timelock = PendingU64 {
        value: 0,
        valid_at: 0,
    };
    Ok(())
}

/// @dev Reverts if `newTimelock` is not within the bounds.
pub fn check_timelock_bounds(new_timelock: u64) -> Result<()> {
    if new_timelock > MAX_TIMELOCK {
        return err!(ManagerError::AboveMaxTimelock);
    }
    if new_timelock < MIN_TIMELOCK {
        return err!(ManagerError::BelowMinTimelock);
    }
    Ok(())
}

pub fn after_timelock(valid_at: u64) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp as u64;

    if valid_at == 0 {
        return err!(ManagerError::NoPendingValue);
    }
    if current_time < valid_at {
        return err!(ManagerError::TimelockNotElapsed);
    }
    Ok(())
}
