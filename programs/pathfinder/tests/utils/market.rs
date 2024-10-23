use anchor_lang::{
    system_program,
    prelude::*,
    ToAccountMetas,
    InstructionData
};

use crate::utils::spl::{MintFixture, TokenAccountFixture};
use crate::utils::user::UserFixture;

use solana_program::{instruction::Instruction};
use solana_program_test::*;
use solana_sdk::{signer::Signer, transaction::Transaction};
use anchor_spl::{associated_token, token::spl_token};
use std::{cell::RefCell, rc::Rc};
use solana_sdk::signature::{Keypair};

#[derive(Clone)]
pub struct MarketFixture {
    ctx: Rc<RefCell<ProgramTestContext>>,
    pub mint: MintFixture,
    pub market_account: Pubkey
}

impl MarketFixture {
    pub fn new(
        ctx: Rc<RefCell<ProgramTestContext>>,
        mint_fixture: &MintFixture,
    ) -> Self {
        let (market_account, _) = Pubkey::find_program_address(
            &[b"market", mint_fixture.key.as_ref()],
            &markets::id()
        );

        Self {
            ctx,
            mint: mint_fixture.clone(),
            market_account: market_account,
        }
    }

    pub fn get_token_program(&self) -> Pubkey {
        self.mint.token_program
    }

    // pub fn get_user_shares(&self, user: &UserFixture) -> Pubkey {
    //     let mut ctx = self.ctx.borrow_mut();
    //     let (user_shares, _) = Pubkey::find_program_address(
    //         &[b"market_shares", self.market_account.as_ref(), ctx.payer.pubkey().as_ref()],
    //         &markets::id()
    //     );
    //     user_shares
    // }

    pub fn get_quote_ata(&self) -> Pubkey {
        associated_token::get_associated_token_address(&self.market_account, &self.mint.key)
    }

    pub async fn get_quote_ata_fixture(&self) -> TokenAccountFixture {
        TokenAccountFixture::fetch(self.ctx.clone(), self.get_quote_ata()).await
    }


    pub async fn try_create_market(
        &self,
    ) -> anyhow::Result<(), BanksClientError> {
        let ix = self
            .make_create_market_ix().await;

        let mut ctx = self.ctx.borrow_mut();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&ctx.payer.pubkey()),
            &[&ctx.payer],
            ctx.last_blockhash,
        );

        ctx.banks_client.process_transaction(tx).await?;

        Ok(())
    }
        

    pub async fn make_create_market_ix(
        &self,
    ) -> Instruction {
        
        let mut ctx = self.ctx.borrow_mut();

        let (user_shares, _) = Pubkey::find_program_address(
            &[b"market_shares", self.market_account.as_ref(), ctx.payer.pubkey().as_ref()],
            &markets::id()
        );

        let oracle = Keypair::new().pubkey(); 
        let lltv = 1_000_000_000;

        let mut accounts = markets::accounts::CreateMarket {
            owner: ctx.payer.pubkey(),
            market: self.market_account,
            quote_mint: self.mint.key,
            vault_ata_quote: self.get_quote_ata(),
            system_program: system_program::ID,
            associated_token_program: associated_token::ID,
            token_program: self.get_token_program(),
        }
        .to_account_metas(Some(true));

        Instruction {
            program_id: markets::id(),
            accounts,
            data: markets::instruction::CreateMarket {
                args: markets::instructions::create_market::CreateMarketArgs {
                    oracle,
                    lltv,
                }
            }.data(),
        }
    }


    pub async fn make_market_deposit_ix(
        &self,
        user: &UserFixture,
        amount: u64,
        shares: u64,
    ) -> Instruction {
        
        let mut ctx = self.ctx.borrow_mut();

        let user_ata = associated_token::get_associated_token_address(&ctx.payer.pubkey(), &self.mint.key);
        let lizz_ata = associated_token::get_associated_token_address(&user.key.pubkey(), &self.mint.key);

        let (user_shares, _) = Pubkey::find_program_address(
            &[b"market_shares", self.market_account.as_ref(), ctx.payer.pubkey().as_ref()],
            &markets::id()
        );

        let mut accounts = markets::accounts::Deposit {
            user: ctx.payer.pubkey(),
            market: self.market_account,
            // user_shares: self.get_user_shares(user),
            user_shares: user_shares,
            quote_mint: self.mint.key,
            vault_ata_quote: self.get_quote_ata(),
            // user_ata_quote: user.get_ata(&self.mint),
            user_ata_quote: user_ata,
            system_program: system_program::ID,
            associated_token_program: associated_token::ID,
            token_program: self.get_token_program(),
        }
        .to_account_metas(Some(true));

        Instruction {
            program_id: markets::id(),
            accounts,
            data: markets::instruction::Deposit {
                args: markets::instructions::deposit::DepositArgs {
                    amount,
                    shares,
                }
            }.data(),
        }
    }

    pub async fn try_deposit(
        &self,
        user: &UserFixture,
        amount: u64,
        shares: u64,
    ) -> anyhow::Result<(), BanksClientError> {
        let ix = self
            .make_market_deposit_ix(user, amount, shares).await;

        let mut ctx = self.ctx.borrow_mut();

        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&ctx.payer.pubkey()),
            &[&ctx.payer],
            ctx.last_blockhash,
        );

        ctx.banks_client.process_transaction(tx).await?;

        Ok(())
    }

}


