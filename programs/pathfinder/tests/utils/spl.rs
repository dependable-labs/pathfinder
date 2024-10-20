use anchor_lang::prelude::*;
use anchor_spl::{
    token::{spl_token, Mint},
    token_2022::{
        self,
        spl_token_2022::{
            self,
            extension::{
                interest_bearing_mint::InterestBearingConfig,
                mint_close_authority::MintCloseAuthority, permanent_delegate::PermanentDelegate,
                transfer_fee::TransferFee, transfer_hook::TransferHook, BaseState,
                BaseStateWithExtensions, ExtensionType, StateWithExtensionsOwned,
            },
        },
    },
    // token_interface::spl_pod::bytemuck::pod_get_packed_len,
};
use solana_program_test::ProgramTestContext;
use solana_sdk::{
    instruction::Instruction,
    program_pack::{Pack},
    signature::Keypair,
    signer::Signer,
    system_instruction::{create_account},
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


    pub async fn create_token_account_and_mint_to(
      &self,
      user: &UserFixture,
      amount: u64,
    ) -> TokenAccountFixture {
        let payer = self.ctx.borrow().payer.pubkey();
        let token_account_f = TokenAccountFixture::new_with_token_program(
            self.ctx.clone(),
            &self.key,
            // &user.key.pubkey(),
            &payer,
            &self.token_program,
        )
        .await;

        let mint_to_ix = self.make_mint_to_ix(
            &token_account_f.key,
            amount,
        );

        let mut ctx = self.ctx.borrow_mut();

        let tx = Transaction::new_signed_with_payer(
            &[mint_to_ix],
            // Some(&user.key.pubkey()),
            // &[&user.key],
            Some(&payer),
            &[&ctx.payer],
            ctx.last_blockhash,
        );

        ctx.banks_client.process_transaction(tx).await.unwrap();

        println!("Created ATA: {:?}", token_account_f.key);
        
        // Optionally, you can also log more details about the token account
        println!("ATA details: {:?}", token_account_f.token);

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
      )
      .unwrap()
    }


  }


  pub struct TokenAccountFixture {
    ctx: Rc<RefCell<ProgramTestContext>>,
    pub key: Pubkey,
    pub token: spl_token_2022::state::Account,
    pub token_program: Pubkey,
  }

  impl TokenAccountFixture {
    pub async fn create_ixs(
        ctx: &Rc<RefCell<ProgramTestContext>>,
        rent: Rent,
        mint_pk: &Pubkey,
        payer_pk: &Pubkey,
        owner_pk: &Pubkey,
        keypair: &Keypair,
        token_program: &Pubkey,
    ) -> Vec<Instruction> {
        let mut ixs = vec![];

        // Get extensions if t22 (should return no exts if spl_token)
        // 1) Fetch mint
        let mint_account = ctx
            .borrow_mut()
            .banks_client
            .get_account(*mint_pk)
            .await
            .unwrap()
            .unwrap();
        let mint_exts =
            spl_token_2022::extension::StateWithExtensions::<spl_token_2022::state::Mint>::unpack(
                &mint_account.data,
            )
            .unwrap();

        let mint_extensions = mint_exts.get_extension_types().unwrap();
        let required_extensions =
            ExtensionType::get_required_init_account_extensions(&mint_extensions);

        let space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Account>(
            &required_extensions,
        )
        .unwrap();

        // Init account
        ixs.push(create_account(
            payer_pk,
            &keypair.pubkey(),
            rent.minimum_balance(space),
            space as u64,
            token_program,
        ));

        // 2) Add instructions
        if required_extensions.contains(&ExtensionType::ImmutableOwner) {
            ixs.push(
                spl_token_2022::instruction::initialize_immutable_owner(
                    token_program,
                    &keypair.pubkey(),
                )
                .unwrap(),
            )
        }

        // Token Account init
        ixs.push(
            spl_token_2022::instruction::initialize_account(
                token_program,
                &keypair.pubkey(),
                mint_pk,
                owner_pk,
            )
            .unwrap(),
        );

        ixs
    }


    pub async fn new_with_token_program(
        ctx: Rc<RefCell<ProgramTestContext>>,
        mint_pk: &Pubkey,
        owner_pk: &Pubkey,
        token_program: &Pubkey,
    ) -> TokenAccountFixture {
        let keypair = Keypair::new();
        TokenAccountFixture::new_with_keypair(ctx, mint_pk, owner_pk, &keypair, token_program).await
    }

    #[allow(unused)]
    pub async fn new_with_keypair(
        ctx: Rc<RefCell<ProgramTestContext>>,
        mint_pk: &Pubkey,
        owner_pk: &Pubkey,
        keypair: &Keypair,
        token_program: &Pubkey,
    ) -> Self {
        let ctx_ref = ctx.clone();

        {
            let payer = ctx.borrow().payer.pubkey();
            let rent = ctx.borrow_mut().banks_client.get_rent().await.unwrap();
            let instructions = Self::create_ixs(
                &ctx,
                rent,
                mint_pk,
                &payer,
                owner_pk,
                keypair,
                token_program,
            )
            .await;

            // Token extensions

            let tx = Transaction::new_signed_with_payer(
                &instructions,
                Some(&ctx.borrow().payer.pubkey()),
                &[&ctx.borrow().payer, keypair],
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
            .get_account(keypair.pubkey())
            .await
            .unwrap()
            .unwrap();

        Self {
            ctx: ctx_ref.clone(),
            key: keypair.pubkey(),
            token: StateWithExtensionsOwned::<spl_token_2022::state::Account>::unpack(account.data)
                .unwrap()
                .base,
            token_program: *token_program,
        }
    }







  }

