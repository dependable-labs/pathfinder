use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::ManagerError;

#[derive(Accounts)]
pub struct SubmitTimelock<'info> {
  #[account(mut)]
  pub admin: Signer<'info>,

  #[account(
      mut,
      seeds = [
          CONFIG_SEED_PREFIX,
          config.quote_mint.as_ref(),
          config.symbol.as_bytes(),
          config.name.as_bytes(),
      ],
      bump = config.bump,
  )]
  pub config: Box<Account<'info, ManagerVaultConfig>>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SubmitTimelockArgs {
  pub new_timelock: u64,
}

impl<'info> SubmitTimelock<'info> {
  pub fn handle(ctx: Context<SubmitTimelock>, args: SubmitTimelockArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if args.new_timelock == config.timelock {
      return err!(ManagerError::AlreadySet);
    }

    if config.pending_timelock_valid_at != 0 {
      return err!(ManagerError::AlreadyPending);
    }

    check_timelock_bounds(args.new_timelock)?;

    // If increasing timelock, apply immediately
    if args.new_timelock > config.timelock {
      set_timelock(config, args.new_timelock)?;
    } else {
      let current_time = Clock::get()?.unix_timestamp as u64;

      // For decreasing timelock, use the timelock mechanism
      config.pending_timelock = Some(args.new_timelock);
      config.pending_timelock_valid_at = current_time.checked_add(config.timelock)
          .ok_or(ManagerError::MathOverflow)?;
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
      seeds = [CONFIG_SEED_PREFIX, config.quote_mint.as_ref(), config.symbol.as_bytes(), config.name.as_bytes()],
      bump = config.bump,
  )]
  pub config: Box<Account<'info, ManagerVaultConfig>>,
}

impl<'info> AcceptTimelock<'info> {
  pub fn handle(ctx: Context<AcceptTimelock>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let current_time = Clock::get()?.unix_timestamp as u64;
    
    // Verify there is a pending timelock
    require!(config.pending_timelock.is_some(), ManagerError::NoPendingTimelock);
    
    // Verify the timelock has expired
    require!(
        current_time >= config.pending_timelock_valid_at,
        ManagerError::TimelockNotExpired
    );
    
    // Apply the new timelock value
    config.timelock = config.pending_timelock.unwrap();
    
    // Clear the pending state
    config.pending_timelock = None;
    config.pending_timelock_valid_at = 0;
    
    Ok(())
  }
}

/// Sets the timelock to the new value
pub fn set_timelock(config: &mut ManagerVaultConfig, new_timelock: u64) -> Result<()> {
  config.timelock = new_timelock;
  config.pending_timelock = None;
  config.pending_timelock_valid_at = 0;
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

pub fn after_timelock(valid_at: u64, current_time: u64) -> Result<()> {
  if valid_at == 0 {
    return err!(ManagerError::NoPendingValue);
  }
  if current_time < valid_at {
    return err!(ManagerError::TimelockNotElapsed);
  }
  Ok(())
}
