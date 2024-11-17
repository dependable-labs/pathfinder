use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;


use crate::math::*;
use crate::{generate_market_seeds, state::*, accrue_interest::accrue_interest};
use crate::error::MarketError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BorrowArgs {
    pub amount: u64,
    pub shares: u64,
}

#[derive(Accounts)]
#[instruction(args: BorrowArgs)]
pub struct Borrow<'info> {
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
    #[account(
        mut,
        seeds = [
            MARKET_COLLATERAL_SEED_PREFIX,
            market.key().as_ref(),
            collateral_mint.key().as_ref()
        ],
        bump = collateral.bump
    )]
    pub collateral: Box<Account<'info, Collateral>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}

impl<'info> Borrow<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: BorrowArgs) -> Result<()> {
         let Borrow {
            user,
            market,
            user_shares,
            quote_mint,
            user_ata_quote,
            vault_ata_quote,
            collateral,
            collateral_mint,
            associated_token_program,
            token_program,
            price_update,
            system_program,
        } = ctx.accounts;

        let mut shares = args.shares;
        let mut assets = args.amount;

        // Validate that either shares or amount is zero, but not both
        if (shares == 0 && assets == 0) || (shares != 0 && assets != 0) {
            return err!(MarketError::InvalidBorrowInput);
        }

        accrue_interest(market)?;
        
        if assets > 0 {
            shares = to_shares_up(&assets, &market.total_borrow_assets, &market.total_borrow_shares)?;
        } else {
            assets = to_assets_down(&shares, &market.total_borrow_assets, &market.total_borrow_shares)?;
        }

        // check if user is solvent after borrowing
        let updated_shares = user_shares.borrow_shares.checked_add(shares).unwrap();

        if !is_solvent(
            market,
            collateral,
            price_update,
            updated_shares,
            user_shares.collateral_amount
        )? {
            return err!(MarketError::NotSolvent);
        }

        msg!("Borrowing {} from vault", assets);

        // Update market shares
        market.total_borrow_shares = market.total_borrow_shares
                .checked_add(shares)
                .ok_or(MarketError::MathOverflow)?;

        // Update market quote amount
        market.total_borrow_assets = market.total_borrow_assets
                .checked_add(assets)
                .ok_or(MarketError::MathOverflow)?;

        if market.total_borrow_assets > market.debt_cap {
            return err!(MarketError::DebtCapExceeded);
        }

        // Update user shares
        user_shares.borrow_shares = user_shares.borrow_shares
                .checked_add(shares)
                .ok_or(MarketError::MathOverflow)?;

        // transfer tokens to borrower
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

pub fn is_solvent(
    market: &Account<Market>,
    collateral: &Account<Collateral>, 
    price_update: &Account<PriceUpdateV2>,
    borrow_shares: u64,
    collateral_amount: u64
) -> Result<bool> {
    let clock = Clock::get()?;
    let (price, price_scale) = collateral.oracle.get_price(price_update, &clock)?;

    // Calculate borrowed amount by converting borrow shares to assets, rounding up
    let borrowed = to_assets_up(
        &borrow_shares,
        &market.total_borrow_assets,
        &market.total_borrow_shares,
    )?;

    // Calculate max borrow amount based on collateral value and LTV factor
    let col_val = (collateral_amount as u128)
        .checked_mul(price as u128) // Multiply collateral amount by price
        .ok_or(MarketError::MathOverflow)?
        .checked_div(price_scale as u128) // Scale down by oracle price scale
        .ok_or(MarketError::MathOverflow)?;

    let max_borrow = col_val
        .checked_mul(collateral.ltv_factor as u128) // Apply LTV factor
        .ok_or(MarketError::MathOverflow)?;

    // User is solvent if max borrow amount >= borrowed amount
    Ok(max_borrow >= (borrowed as u128))

}