use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{
        self, get_associated_token_address
    },
    token::{self, spl_token, Mint},
    token_2022::{
        self,
        spl_token_2022::{
            self,
            extension::{
                BaseState,
                StateWithExtensionsOwned,
            },
        },
    }
};
use solana_program_test::ProgramTestContext;
use solana_sdk::{
    instruction::Instruction,
    program_pack::{Pack, Sealed},
    signature::Keypair,
    signer::Signer,
    system_instruction::create_account,
    transaction::Transaction,
};
use crate::utils::user::UserFixture;
use std::{cell::RefCell, rc::Rc};

#[derive(Clone)]
pub struct MintFixture {
    pub ctx: Rc<RefCell<ProgramTestContext>>,
    pub key: Pubkey,
    pub mint: spl_token_2022::state::Mint,
    pub token_program: Pubkey,
}

impl MintFixture {
    pub async fn new(
        ctx: Rc<RefCell<ProgramTestContext>>,
        mint_keypair: Option<Keypair>,
        mint_decimals: Option<u8>,
    ) -> MintFixture {
        let ctx_ref = Rc::clone(&ctx);
        let keypair = mint_keypair.unwrap_or_else(Keypair::new);
        let mint = {
            let mut ctx = ctx.borrow_mut();

            let rent = ctx.banks_client.get_rent().await.unwrap();

            let init_account_ix = create_account(
                &ctx.payer.pubkey(),
                &keypair.pubkey(),
                rent.minimum_balance(Mint::LEN),
                Mint::LEN as u64,
                &spl_token::id(),
            );
            let init_mint_ix = spl_token::instruction::initialize_mint(
                &spl_token::id(),
                &keypair.pubkey(),
                &ctx.payer.pubkey(),
                None,
                mint_decimals.unwrap_or(6),
            )
            .unwrap();

            let tx = Transaction::new_signed_with_payer(
                &[init_account_ix, init_mint_ix],
                Some(&ctx.payer.pubkey()),
                &[&ctx.payer, &keypair],
                ctx.last_blockhash,
            );

            ctx.banks_client.process_transaction(tx).await.unwrap();

            let mint_account = ctx
                .banks_client
                .get_account(keypair.pubkey())
                .await
                .unwrap()
                .unwrap();

            spl_token_2022::state::Mint::unpack(mint_account.data.as_slice()).unwrap()
        };

        MintFixture {
            ctx: ctx_ref,
            key: keypair.pubkey(),
            mint,
            token_program: spl_token::id(),
        }
    }

    pub async fn create_ata_and_mint_to(
        &self,
        user: &UserFixture,
        amount: u64,
    ) -> TokenAccountFixture {
        let payer = self.ctx.borrow().payer.pubkey();
        let ata = get_associated_token_address(&payer, &self.key);

        let token_account_f = TokenAccountFixture::new_ata(
            self.ctx.clone(),
            &self.key,
            &payer,
            &self.token_program,
        )
        .await;

        // Mint to the newly created ATA
        let mint_to_ix = self.make_mint_to_ix(
            &token_account_f.ata,
            amount
        );

        let mut ctx = self.ctx.borrow_mut();

        let tx = Transaction::new_signed_with_payer(
                &[mint_to_ix],
                Some(&ctx.payer.pubkey()),
                &[&ctx.payer],
                ctx.last_blockhash,
            );

        ctx.banks_client.process_transaction(tx).await.unwrap();

        token_account_f
    }

    pub fn make_mint_to_ix(&self, dest: &Pubkey, amount: u64) -> Instruction {
      let ctx = self.ctx.borrow();

        spl_token_2022::instruction::mint_to(
            &self.token_program,
            &self.key,
            dest,
            &ctx.payer.pubkey(),
            &[&ctx.payer.pubkey()],
            amount,
        ).unwrap()
    }

  }


  pub struct TokenAccountFixture {
    ctx: Rc<RefCell<ProgramTestContext>>,
    pub ata: Pubkey,
    pub token: spl_token_2022::state::Account,
    pub token_program: Pubkey,
  }

  impl TokenAccountFixture {

    pub async fn new_ata(
        ctx: Rc<RefCell<ProgramTestContext>>,
        mint_pk: &Pubkey,
        owner_pk: &Pubkey,
        token_program: &Pubkey,
    ) -> TokenAccountFixture {
        let ctx_ref = ctx.clone();
        let ata = get_associated_token_address(&owner_pk, &mint_pk);

        {
            let payer = ctx.borrow().payer.pubkey();

            // Create a minimal AccountInfo for the Associated Token Program
            let init_account_ix = spl_associated_token_account::instruction::create_associated_token_account(
                &payer,
                &owner_pk,
                &mint_pk,
                &token_program,
            );

            let tx = Transaction::new_signed_with_payer(
                &[init_account_ix],
                Some(&payer),
                &[&ctx.borrow().payer],
                ctx.borrow().last_blockhash,
            );

            ctx.borrow_mut()
                .banks_client
                .process_transaction(tx)
                .await
                .unwrap();
        }

        let mut ctx = ctx.borrow_mut();
        let account = ctx
            .banks_client
            .get_account(ata)
            .await
            .unwrap()
            .unwrap();

        Self {
            ctx: ctx_ref.clone(),
            ata: ata,
            token: StateWithExtensionsOwned::<spl_token_2022::state::Account>::unpack(account.data)
                .unwrap()
                .base,
            token_program: *token_program,
        }
    }

    pub async fn fetch(
        ctx: Rc<RefCell<ProgramTestContext>>,
        address: Pubkey,
    ) -> TokenAccountFixture {
        let token: spl_token_2022::state::Account =
            get_and_deserialize_t22(ctx.clone(), address).await;
        let token_program = token.owner;

        Self {
            ctx: ctx.clone(),
            ata: address,
            token,
            token_program,
        }
    }

    pub async fn balance(&self) -> u64 {
        let token_account: spl_token_2022::state::Account =
            get_and_deserialize_t22(self.ctx.clone(), self.ata).await;

        token_account.amount
    }
}

pub async fn get_and_deserialize_t22<T: BaseState + Pack + Sealed>(
    ctx: Rc<RefCell<ProgramTestContext>>,
    pubkey: Pubkey,
) -> T {
    let mut ctx = ctx.borrow_mut();
    let account = ctx.banks_client.get_account(pubkey).await.unwrap().unwrap();

    StateWithExtensionsOwned::<T>::unpack(account.data)
        .unwrap()
        .base
}
