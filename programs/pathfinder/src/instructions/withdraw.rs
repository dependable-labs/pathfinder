use anchor_lang::accounts::program;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::{math::*, accrue_interest::accrue_interest, generate_market_seeds, state::*};
use crate::error::MarketError;


#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawArgs {
    pub amount: u64,
    pub shares: u64,
}

#[derive(Accounts)]
#[instruction(args: WithdrawArgs)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [
            MARKET_SEED_PREFIX,
            market.quote_mint.as_ref(),
        ],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    // user shares
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<UserShares>(),
        seeds = [
            MARKET_SHARES_SEED_PREFIX,
            market.key().as_ref(),
            user.key().as_ref()
        ],
        bump
    )]
    pub user_shares: Box<Account<'info, UserShares>>,

    // quote
    #[account(constraint = quote_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = market.quote_mint,
        associated_token::authority = market,
    )]
    pub vault_ata_quote: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = market.quote_mint,
        associated_token::authority = user,
    )]
    pub user_ata_quote: Box<Account<'info, TokenAccount>>,

    // collateral
    #[account(constraint = collateral_mint.is_initialized == true)]
    pub collateral_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Withdraw<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: WithdrawArgs) -> Result<()> {
         let Withdraw {
            user,
            market,
            user_shares,
            quote_mint,
            user_ata_quote,
            collateral_mint,
            vault_ata_quote,
            associated_token_program,
            token_program,
            system_program,
        } = ctx.accounts;

        let mut shares = args.shares;
        let mut assets = args.amount;

        // Validate that either shares or amount is zero, but not both
        if (shares == 0 && assets == 0) || (shares != 0 && assets != 0) {
            return err!(MarketError::InvalidWithdrawInput);
        }

        accrue_interest(market)?;

        if assets > 0 {
            shares = to_shares_up(&assets, &market.total_quote, &market.total_shares)?;
        } else {
            assets = to_assets_down(&shares, &market.total_quote, &market.total_shares)?;
        }

        // Validate that the user isn't requesting more shares than they possess
        if shares > user_shares.shares {
            return err!(MarketError::InsufficientBalance);
        }

        // Update accumulators
        market.total_shares = market.total_shares
                .checked_sub(shares)
                .ok_or(error!(MarketError::MathUnderflow))?;

        market.total_quote = market.total_quote
                .checked_sub(assets)
                .ok_or(error!(MarketError::MathUnderflow))?;

        // Update user shares
        user_shares.shares = user_shares.shares
                .checked_sub(shares)
                .ok_or(MarketError::MathUnderflow)?;

        msg!("Withdrawing {} from the vault", assets);

        // transfer tokens to depositor
        let seeds = generate_market_seeds!(market);
        let signer = &[&seeds[..]];

        transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer {
                    from: vault_ata_quote.to_account_info(),
                    to: user_ata_quote.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer,
            ),
            assets,
        )?;
        
        Ok(())

    }
}