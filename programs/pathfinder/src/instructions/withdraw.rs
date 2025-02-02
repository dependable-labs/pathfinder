use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;
use crate::state::*;

use crate::{math::*, accrue_interest::accrue_interest, generate_market_seeds};
use crate::error::MarketError;


#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawArgs {
    pub amount: u64,
    pub shares: u64,
    pub owner: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: WithdrawArgs)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED_PREFIX],
        bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: needed for associated token constraint
    #[account(mut)]
    pub recipient: AccountInfo<'info>,

    // position delegate
    #[account(
        init_if_needed,
        payer = user,
        constraint = args.owner.key() == user.key() || position_delegate.delegate == user.key() @ MarketError::UnauthorizedDelegate,
        space = 8 + std::mem::size_of::<PositionDelegate>(),
        seeds = [
            DELEGATE_SEED_PREFIX,
            args.owner.key().as_ref(),
        ],
        bump
    )]
    pub position_delegate: Box<Account<'info, PositionDelegate>>,

    // market
    #[account(
        mut,
        seeds = [
            MARKET_SEED_PREFIX,
            quote_mint.key().as_ref(),
            collateral_mint.key().as_ref(),
            &market.ltv_factor.to_le_bytes(),
            &market.oracle.feed_id,
        ],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    // user shares
    #[account(
        mut,
        seeds = [
            MARKET_SHARES_SEED_PREFIX,
            market.key().as_ref(),
            args.owner.key().as_ref()
        ],
        bump
    )]
    pub user_shares: Box<Account<'info, LenderShares>>,

    // quote
    #[account(constraint = quote_mint.key() == market.quote_mint.key())]
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = market.quote_mint,
        associated_token::authority = market,
    )]
    pub vault_ata_quote: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::authority = recipient,
        associated_token::mint = quote_mint,
    )]
    pub recipient_ata_quote: Box<Account<'info, TokenAccount>>,

    // collateral
    #[account(constraint = collateral_mint.key() == market.collateral_mint.key())]
    pub collateral_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// impl<'info> Withdraw<'info> {
//     pub fn validate(&self) -> Result<()> {
//         Ok(())
//     }

//     pub fn handle(ctx: Context<Self>, args: WithdrawArgs) -> Result<()> {
//          let Withdraw {
//             user,
//             config,
//             market,
//             user_shares,
//             recipient_ata_quote,
//             vault_ata_quote,
//             token_program,
//             ..
//         } = ctx.accounts;

//         let mut shares = args.shares;
//         let mut assets = args.amount;

//         // Validate that either shares or amount is zero, but not both
//         if (shares == 0 && assets == 0) || (shares != 0 && assets != 0) {
//             return err!(MarketError::AssetShareValueMismatch);
//         }

//         accrue_interest(market, config)?;

//         let total_deposits = market.total_deposits()?;

//         if assets > 0 {
//             shares = to_shares_up(assets, total_deposits, market.total_shares)?;
//         } else {
//             assets = to_assets_down(shares, total_deposits, market.total_shares)?;
//         }

//         // Update accumulators
//         market.total_shares = market.total_shares
//                 .checked_sub(shares)
//                 .ok_or(error!(MarketError::MathUnderflow))?;

//         if user.key() == config.fee_recipient {
//             market.fee_shares = market.fee_shares
//                 .checked_sub(shares)
//                 .ok_or(error!(MarketError::MathOverflow))?;
//         } else {
//             // Update user shares
//             user_shares.shares = user_shares.shares
//                     .checked_sub(shares)
//                     .ok_or(error!(MarketError::MathUnderflow))?;
//         }

//         // transfer tokens to depositor
//         let seeds = generate_market_seeds!(market);
//         let signer = &[&seeds[..]];

//         transfer(
//             CpiContext::new_with_signer(
//                 token_program.to_account_info(),
//                 Transfer {
//                     from: vault_ata_quote.to_account_info(),
//                     to: recipient_ata_quote.to_account_info(),
//                     authority: market.to_account_info(),
//                 },
//                 signer,
//             ),
//             assets,
//         )?;
        
//         Ok(())

//     }

impl<'info> Withdraw<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: WithdrawArgs) -> Result<()> {
         let Withdraw {
            user,
            config,
            market,
            user_shares,
            recipient_ata_quote,
            vault_ata_quote,
            token_program,
            ..
        } = ctx.accounts;

        let mut shares = args.shares;
        let mut assets = args.amount;

        process_withdrawal_and_transfer(
            market,
            config,
            &mut shares,
            &mut assets,
            false,
            Some(user_shares),
            vault_ata_quote,
            recipient_ata_quote,
            token_program,
        )?;
        
        Ok(())
    }
}


pub fn process_withdrawal_and_transfer<'info>(
    market: &mut Account<'info, Market>,
    config: &Account<'info, Config>,
    shares: &mut u64,
    assets: &mut u64,
    is_fee_recipient: bool,
    user_shares: Option<&mut Account<'info, LenderShares>>,
    vault_ata_quote: &Account<'info, TokenAccount>,
    recipient_ata_quote: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    // Process withdrawal amounts
    if (*shares == 0 && *assets == 0) || (*shares != 0 && *assets != 0) {
        return err!(MarketError::AssetShareValueMismatch);
    }

    msg!("Withdrawing {} shares", shares);
    msg!("Market fee shares: {}", market.fee_shares);

    accrue_interest(market, config)?;

    let total_deposits = market.total_deposits()?;

    msg!("After accruing interest: {}", market.fee_shares);

    if *assets > 0 {
        *shares = to_shares_up(*assets, total_deposits, market.total_shares)?;
    } else {
        *assets = to_assets_down(*shares, total_deposits, market.total_shares)?;
    }

    // Update market total shares
    market.total_shares = market.total_shares
        .checked_sub(*shares)
        .ok_or(error!(MarketError::MathUnderflow))?;

    if is_fee_recipient {
        market.fee_shares = market.fee_shares
            .checked_sub(*shares)
            .ok_or(error!(MarketError::MathOverflow))?;
    } else if let Some(shares_account) = user_shares {
        // Update user shares
        shares_account.shares = shares_account.shares
            .checked_sub(*shares)
            .ok_or(error!(MarketError::MathUnderflow))?;
    }

    // Transfer tokens
    let seeds = generate_market_seeds!(market);
    let signer = &[&seeds[..]];

    transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: vault_ata_quote.to_account_info(),
                to: recipient_ata_quote.to_account_info(),
                authority: market.to_account_info(),
            },
            signer,
        ),
        *assets,
    )?;

    Ok(())
}