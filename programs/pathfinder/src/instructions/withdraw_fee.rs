use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::*;
use crate::state::*;
use crate::error::MarketError;
use crate::instructions::withdraw::process_withdrawal_and_transfer;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawFeeArgs {
    pub amount: u64,
    pub shares: u64,
}

#[derive(Accounts)]
#[instruction(args: WithdrawFeeArgs)]
pub struct WithdrawFee<'info> {
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

impl<'info> WithdrawFee<'info> {
    pub fn validate(&self) -> Result<()> {
        require!(self.config.fee_recipient == self.recipient.key(), MarketError::InvalidRecipient);
        require!(self.config.fee_recipient == self.user.key(), MarketError::InvalidRecipient);

        Ok(())
    }

    pub fn handle(ctx: Context<Self>, args: WithdrawFeeArgs) -> Result<()> {
         let WithdrawFee {
            config,
            market,
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
            true,
            None,
            vault_ata_quote,
            recipient_ata_quote,
            token_program,
        )?;

        Ok(())

    }
}