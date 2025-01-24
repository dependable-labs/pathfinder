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

    // borrower shares
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<BorrowerShares>(),
        seeds = [
            BORROWER_SHARES_SEED_PREFIX,
            collateral.key().as_ref(),
            user.key().as_ref()
        ],
        bump
    )]
    pub borrower_shares: Box<Account<'info, BorrowerShares>>,

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

        // Validate that collateral is active
        require!(
            self.collateral.last_active_timestamp == 0,
            MarketError::CollateralNotActive
        );

        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: BorrowArgs) -> Result<()> {
        let Borrow {
            market,
            borrower_shares,
            user_ata_quote,
            vault_ata_quote,
            collateral,
            collateral_mint,
            token_program,
            price_update,
            ..
        } = ctx.accounts;

        let mut shares = args.shares;
        let mut assets = args.amount;

        // Validate that either shares or amount is zero, but not both
        if (shares == 0 && assets == 0) || (shares != 0 && assets != 0) {
            return err!(MarketError::AssetShareValueMismatch);
        }

        msg!("borrowing {}", assets);

        accrue_interest(market)?;

        let total_borrows = market.total_borrows()?;
 
        if assets > 0 {
            shares = to_shares_up(assets, total_borrows, market.total_borrow_shares)?;
        } else {
            assets = to_assets_down(shares, total_borrows, market.total_borrow_shares)?;
        }

        // check if user is solvent after borrowing
        let updated_shares = borrower_shares.borrow_shares.checked_add(shares).unwrap();

        if !is_solvent(
            market,
            collateral,
            price_update,
            updated_shares,
            borrower_shares.collateral_amount,
            collateral_mint.decimals
        )? {
            return err!(MarketError::NotSolvent);
        }

        // Update market shares
        market.total_borrow_shares = market.total_borrow_shares
                .checked_add(shares)
                .ok_or(MarketError::MathOverflow)?;

        // Update user shares
        borrower_shares.borrow_shares = borrower_shares.borrow_shares
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
    collateral_amount: u64,
    collateral_decimals: u8
) -> Result<bool> {

    // price is low end of confidence interval
    let (price, price_scale) = collateral.oracle.get_price(price_update, false)?;

    let total_borrows = market.total_borrows()?;

    // Calculate borrowed amount by converting borrow shares to assets, rounding up
    let mut borrowed = to_assets_up(
        borrow_shares,
        total_borrows,
        market.total_borrow_shares,
    )?;

    // Calculate max borrow amount based on collateral value and LTV factor
    let max_borrow = (collateral_amount as u128)
        .checked_mul(price as u128) // Multiply collateral amount by price
        .ok_or(MarketError::MathOverflow)?
        .checked_div(price_scale as u128) // Scale down by oracle price scale
        .ok_or(MarketError::MathOverflow)?
        .checked_mul(collateral.ltv_factor as u128) // Apply LTV factor
        .ok_or(MarketError::MathOverflow)?
        .checked_div(10_u128.pow(collateral_decimals as u32)) // Scale by collateral decimals
        .ok_or(MarketError::MathOverflow)?;

    // User is solvent if max borrow amount >= borrowed amount
    Ok(max_borrow >= (borrowed as u128))
}

pub fn borrow(ctx: Context<Borrow>, args: BorrowArgs) -> Result<()> {
    // Run validation first
    ctx.accounts.validate()?;
    
    // Then proceed with handling
    Borrow::handle(ctx, args)
}