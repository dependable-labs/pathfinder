
use anchor_lang::prelude::*;
use anchor_spl::{
  token::{mint_to, Mint, MintTo, Token, TokenAccount},
  metadata::{
      create_metadata_accounts_v3,
      mpl_token_metadata::types::DataV2,
      CreateMetadataAccountsV3, 
      Metadata,
  },
};
use crate::{state::*, generate_manager_vault_seeds};

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

pub fn _mint<'info> (
  mint_account: &Account<'info, Mint>,
  to: &AccountInfo<'info>,
  token_program: &Program<'info, Token>,
  config: &Account<'info, ManagerVaultConfig>,
  amount: u64,
) -> Result<()> {

  mint_to(
    CpiContext::new(
      token_program.to_account_info(),
      MintTo {
        mint: mint_account.to_account_info(),
        to: to.to_account_info(),
        authority: config.to_account_info(),
      },
    ),
    amount,
  )?;

  Ok(())
}