use anchor_spl::{
  associated_token::AssociatedToken,
  token::{mint_to, Mint, MintTo, Token, TokenAccount},
  metadata::{
      create_metadata_accounts_v3,
      mpl_token_metadata::types::DataV2,
      CreateMetadataAccountsV3, 
      Metadata,
  },
};
use anchor_lang::prelude::*;
use crate::{state::*, generate_manager_vault_seeds};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateManagerArgs {
  pub owner: Pubkey,
  pub guardian: Pubkey,
  pub fee_recipient: Pubkey,
  pub skim_recipient: Pubkey,
  pub curator: Pubkey,
  pub timelock: u64,
  pub decimals_offset: u8,
  pub name: String,
  pub symbol: String,
}

#[derive(Accounts)]
#[instruction(args: CreateManagerArgs)]
pub struct CreateManager<'info> { 
  #[account(mut)]
  pub user: Signer<'info>,

  // vault
  #[account(
    init,
    payer = user,
    space = 8 + std::mem::size_of::<ManagerVaultConfig>(),
    seeds = [
        CONFIG_SEED_PREFIX,
        quote_mint.key().as_ref(),
        &args.symbol.as_bytes(),
        &args.name.as_bytes(),
    ],
    bump,
  )]
  pub config: Box<Account<'info, ManagerVaultConfig>>,

  // Share token mint account
  #[account(
    init,
    payer = user,
    mint::decimals = quote_mint.decimals,  // Match quote token decimals
    mint::authority = config,  // The vault controls minting/burning
    mint::freeze_authority = config,
  )]
  pub share_mint: Account<'info, Mint>,

  #[account(constraint = quote_mint.is_initialized == true)]
  pub quote_mint: Box<Account<'info, Mint>>,

  /// CHECK: The metadata account for the share token
  #[account(
    mut,
    seeds = [b"metadata", token_metadata_program.key().as_ref(), share_mint.key().as_ref()],
    bump,
    seeds::program = token_metadata_program.key(),
  )]
  pub metadata_account: AccountInfo<'info>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub token_metadata_program: Program<'info, Metadata>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> CreateManager<'info> {
  pub fn handle(ctx: Context<CreateManager>, args: CreateManagerArgs) -> Result<()> {

    let CreateManager {
      user,
      config,
      metadata_account,
      share_mint,
      system_program,
      rent,
      token_metadata_program,
      quote_mint,
      ..
    } = ctx.accounts;

    config.set_inner(ManagerVaultConfig {
        bump: ctx.bumps.config,
        name: args.name,
        symbol: args.symbol,
        quote_mint: quote_mint.key(),
        curator: args.curator,
        guardian: args.guardian,
        fee_recipient: args.fee_recipient,
        skim_recipient: args.skim_recipient,
        timelock: args.timelock,
        fee: 0,
        decimals_offset: args.decimals_offset,
        pathfinder_program: PATHFINDER_PROGRAM_ID,  // The PATHFINDER immutable
        last_total_assets: 0,
    });

    // Create the metadata account for the share token
    _create_metadata_account(
      &config.name,
      &config.symbol,
      &config,
      &metadata_account,
      &share_mint,
      &user,
      &system_program,
      &rent,
      &token_metadata_program,
    )?;


    Ok(())

  }
}


pub fn _create_metadata_account<'info>(
  token_name: &String,
  token_symbol: &String,
  config: &Account<'info, ManagerVaultConfig>,
  metadata_account: &AccountInfo<'info>,
  mint_account: &Account<'info, Mint>,
  payer: &Signer<'info>,
  system_program: &Program<'info, System>,
  rent: &Sysvar<'info, Rent>,
  token_metadata_program: &Program<'info, Metadata>,
) -> Result<()> {

  // generate seeds for the manager vault
  let seeds = generate_manager_vault_seeds!(config);
  let signer = &[&seeds[..]];

  // Cross Program Invocation (CPI)
  // Invoking the create_metadata_account_v3 instruction on the token metadata program
  create_metadata_accounts_v3(
      CpiContext::new_with_signer(
    token_metadata_program.to_account_info(),
    CreateMetadataAccountsV3 {
        metadata: metadata_account.to_account_info(),
        mint: mint_account.to_account_info(),
        mint_authority: config.to_account_info(),
        update_authority: config.to_account_info(),
        payer: payer.to_account_info(),
        system_program: system_program.to_account_info(),
        rent: rent.to_account_info(),
      },
      signer,
    ),
    DataV2 {
      name: token_name.clone(),
      symbol: token_symbol.clone(),
      uri: "".to_string(),
      seller_fee_basis_points: 0,
      creators: None,
      collection: None,
      uses: None,
    },
    false, // Is mutable
    false,  // Update authority is signer
    None,  // Collection details
  )?;

  Ok(())

}
