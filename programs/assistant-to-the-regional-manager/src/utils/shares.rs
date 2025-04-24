use anchor_lang::prelude::*;
use anchor_spl::{
  token::{mint_to, Mint, MintTo, Token},
  metadata::{
      create_metadata_accounts_v3,
      mpl_token_metadata::types::DataV2,
      CreateMetadataAccountsV3, 
      Metadata,
  },
};
use crate::{
  state::*,
  generate_manager_vault_seeds,
  instructions::Deposit
};
use pathfinder::instructions::ViewMarket;
use pathfinder::state::Market;
use pathfinder::cpi::view_expected_supply_assets;

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

// pub fn _mint<'info> (
//   mint_account: &Account<'info, Mint>,
//   to: &AccountInfo<'info>,
//   token_program: &Program<'info, Token>,
//   config: &Account<'info, ManagerVaultConfig>,
//   amount: u64,
// ) -> Result<()> {

//   mint_to(
//     CpiContext::new(
//       token_program.to_account_info(),
//       MintTo {
//         mint: mint_account.to_account_info(),
//         to: to.to_account_info(),
//         authority: config.to_account_info(),
//       },
//     ),
//     amount,
//   )?;

//   Ok(())
// }

// pub fn total_assets(
//   ctx: &Context<Deposit>,
//     // queue: &Account<'_, QueueState>,
//     // config: &Account<'_, ManagerVaultConfig>
// ) -> Result<u64> {
//     let mut assets: u64 = 0;
//     let queue = &ctx.accounts.queue;
//     let config = ctx.accounts.pathfinder_config;

//     for market_id in queue.withdraw_queue.iter() {

//         let market = Account::<Market>::try_from(market_id)?;
//         let market_account = 



//         let view_market = ViewMarket {
//             market: market,
//             config: config,
//         };
//         let ctx = CpiContext::new(
//             ctx.accounts.pathfinder_program.to_account_info(),
//             view_market,
//         );
//         let expected_assets = view_expected_supply_assets(ctx, market.shares)?;
//         assets = assets.checked_add(expected_assets).unwrap();
//     }
    
//     Ok(assets)
// }


