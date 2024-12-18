use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;

use crate::math::*;
use crate::{state::*, accrue_interest::accrue_interest, borrow::{is_solvent, restriction_fee}};
use crate::error::MarketError;
use crate::generate_market_seeds;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;



#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct LiquidateArgs {
    pub borrower: Pubkey,
    pub collateral_amount: u64,
    pub repay_shares: u64,
}

#[derive(Accounts)]
#[instruction(args: LiquidateArgs)]
pub struct Liquidate<'info> {
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
        mut,
        seeds = [
            BORROWER_SHARES_SEED_PREFIX,
            collateral.key().as_ref(),
            args.borrower.as_ref()
        ],
        bump
    )]
    pub borrower_shares: Box<Account<'info, BorrowerShares>>,

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
    #[account(
      mut,
      associated_token::mint = collateral.collateral_mint,
      associated_token::authority = market,
    )]
    pub vault_ata_collateral: Box<Account<'info, TokenAccount>>,
    #[account(
      mut,
      associated_token::mint = collateral_mint,
      associated_token::authority = user,
    )]
    pub user_ata_collateral: Box<Account<'info, TokenAccount>>,


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

     pub price_update: Account<'info, PriceUpdateV2>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Liquidate<'info> {
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: LiquidateArgs) -> Result<()> {
         let Liquidate {
            user,
            market,
            borrower_shares,
            collateral_mint,
            collateral,
            vault_ata_collateral,
            user_ata_collateral,
            vault_ata_quote,
            user_ata_quote,
            price_update,
            token_program,
            ..
        } = ctx.accounts;

        let mut repay_shares = args.repay_shares;
        let mut collateral_amount = args.collateral_amount;

        // Validate that either shares or amount is zero, but not both
        if (repay_shares == 0 && collateral_amount == 0) || (repay_shares != 0 && collateral_amount != 0) {
            return err!(MarketError::AssetShareValueMismatch);
        }

        accrue_interest(market)?;

        if is_solvent(
            market,
            collateral,
            price_update,
            borrower_shares.borrow_shares,
            borrower_shares.collateral_amount,
            collateral_mint.decimals
        )? {
          return err!(MarketError::BorrowerIsSolvent);
        }

        // The liquidation incentive factor is min(maxLiquidationIncentiveFactor, 1/(1 - cursor*(1 - lltv))).
        let cursor_factor = w_mul_down(
                (WAD as u64) - LIQUIDATION_CURSOR as u64,
                ((WAD as u128) - (collateral.ltv_factor as u128)) as u64
        )?;

        let liquidation_incentive_factor = min_u64(
            MAX_LIQUIDATION_INCENTIVE_FACTOR,
            w_div_down(
              WAD as u64,
              cursor_factor
            )?
        );

        let (collateral_price, price_scale) = collateral.oracle.get_price(price_update)?;

        if collateral_amount > 0 {
          let collateral_quoted = mul_div_up(collateral_amount as u128, collateral_price as u128, price_scale as u128)?;

          repay_shares = to_shares_up(
              w_div_up(collateral_quoted, liquidation_incentive_factor)?,
              market.total_borrow_assets,
              market.total_borrow_shares
          )?;

        } else {

          let shares_to_collateral = to_assets_down(
              repay_shares,
              market.total_borrow_assets,
              market.total_borrow_shares
          )?;

          let collateral_with_incentive = w_mul_down(shares_to_collateral, liquidation_incentive_factor)?;
          
          collateral_amount = mul_div_down(collateral_with_incentive as u128, price_scale as u128, collateral_price as u128)?;
        }

        let repaid_quote = to_assets_up(
            repay_shares,
            market.total_borrow_assets,
            market.total_borrow_shares
        )?;

        borrower_shares.borrow_shares = borrower_shares.borrow_shares
                .checked_sub(repay_shares)
                .ok_or(MarketError::MathUnderflow)?;

        market.total_borrow_shares = market.total_borrow_shares
                .checked_sub(repay_shares)
                .ok_or(MarketError::MathUnderflow)?;

        market.total_borrow_assets = max_u64(market.total_borrow_assets
                .checked_sub(repaid_quote)
                .ok_or(MarketError::MathUnderflow)?, 0);

        borrower_shares.collateral_amount = borrower_shares.collateral_amount
                .checked_sub(collateral_amount)
                .ok_or(MarketError::MathUnderflow)?;

        let fee = restriction_fee(repaid_quote, collateral.last_active_timestamp)?;

        // Distribute fee back to lenders
        market.total_quote = market.total_quote
                .checked_add(fee)
                .ok_or(MarketError::MathOverflow)?; 

        let repaid_quote_with_fee = repaid_quote.checked_add(fee).ok_or(MarketError::MathOverflow)?;

        let mut bad_debt_shares = 0;
        let mut bad_debt = 0;

        if borrower_shares.collateral_amount == 0 {
          bad_debt_shares = borrower_shares.borrow_shares;
          bad_debt = min_u64(
              market.total_borrow_assets,
              to_assets_up(
                bad_debt_shares,
                market.total_borrow_assets,
                market.total_borrow_shares
              )?
          );

          market.total_borrow_assets = max_u64(market.total_borrow_assets.checked_sub(bad_debt).unwrap(), 0);
          market.total_quote = max_u64(market.total_quote.checked_sub(bad_debt).unwrap(), 0);
          market.total_borrow_shares = market.total_borrow_shares.checked_sub(bad_debt_shares).unwrap();
          borrower_shares.borrow_shares = 0;
        }

        //add callback mechansim?

        // transfer tokens to liquidator
        let seeds = generate_market_seeds!(market);
        let signer = &[&seeds[..]];

        transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer {
                    from: vault_ata_collateral.to_account_info(),
                    to: user_ata_collateral.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer,
            ),
            collateral_amount,
        )?;

        msg!("Liquidating {} from vault", collateral_amount);

        // Create CpiContext for the transfer
        let cpi_context = CpiContext::new(
            token_program.to_account_info(),
            Transfer {
              from: user_ata_quote.to_account_info(),
              to: vault_ata_quote.to_account_info(),
              authority: user.to_account_info(),
            }
        );

        // Verify liquidator has sufficient quote tokens
        require_gte!(
            user_ata_quote.amount,
            repaid_quote_with_fee,
            MarketError::InsufficientBalance
        );
        
        // transfer tokens to vault
        transfer(
            cpi_context,
            repaid_quote_with_fee,
        )?;

        Ok(())
    }
}