use anchor_lang::prelude::*;
use crate::utils::spl::MintFixture;

// use solana_program::{instruction::Instruction, sysvar};
use solana_program_test::*;
// use solana_sdk::{
//     compute_budget::ComputeBudgetInstruction, signature::Keypair, signer::Signer,
//     transaction::Transaction,
// };
use solana_sdk::{signature::Keypair, signer::Signer};
use anchor_spl::associated_token;

use std::{cell::RefCell, rc::Rc};

#[derive(Clone)]
pub struct UserFixture {
    ctx: Rc<RefCell<ProgramTestContext>>,
    pub key: Rc<Keypair>,
}

impl UserFixture {
  pub async fn new(
        ctx: Rc<RefCell<ProgramTestContext>>,
  ) -> Self {
        UserFixture {
            ctx,
            key: Rc::new(Keypair::new()),
        }
    }

    pub fn get_ata(&self, mint: &MintFixture) -> Pubkey {
        associated_token::get_associated_token_address(&self.key.pubkey(), &mint.key)
    }

}