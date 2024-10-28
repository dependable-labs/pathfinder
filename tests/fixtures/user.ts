import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BanksClient } from 'solana-bankrun';
import { BankrunProvider } from 'anchor-bankrun';

import {
  createAccount,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "spl-token-bankrun";


const INITIAL_TOKEN_AMOUNT = 100_000 * LAMPORTS_PER_SOL;

export class UserFixture {
  public key: PublicKey;
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public banksClient: BanksClient;
  public quoteMint: PublicKey;
  public quoteAta: PublicKey;
  public collateralMint: PublicKey;
  public collateralAta: PublicKey;

  public constructor(
    public _key: PublicKey,
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _banksClient: BanksClient,
    public _quoteMint: PublicKey,
    public _collateralMint: PublicKey,
  ) {
    this.key = _key;
    this.program = _program;
    this.provider = _provider;
    this.banksClient = _banksClient;
    this.quoteMint = _quoteMint;
    this.collateralMint = _collateralMint;
  }

  public async init_and_fund_accounts(quoteAmount: anchor.BN, collateralAmount: anchor.BN): Promise<void> {
    await this.init_accounts();
    await this.fund_accounts(quoteAmount, collateralAmount);
  }

  private async init_accounts(): Promise<void> {
    this.quoteAta = await createAssociatedTokenAccount(
      this.banksClient,
      this.provider.wallet.payer,
      this.quoteMint,
      this.key,
    );

    this.collateralAta = await createAssociatedTokenAccount(
      this.banksClient,
      this.provider.wallet.payer,
      this.collateralMint,
      this.key,
    );
  }

  private async fund_accounts(quoteAmount: anchor.BN, collateralAmount: anchor.BN): Promise<void> {

    await mintTo(
      this.banksClient,
      this.provider.wallet.payer,
      this.quoteMint,
      this.get_ata(this.quoteMint),
      this.key,
      quoteAmount,
    );

    await mintTo(
      this.banksClient,
      this.provider.wallet.payer,
      this.collateralMint,
      this.collateralAta,
      this.key,
      collateralAmount,
    );
  }

  public async get_balance(account: PublicKey): Promise<any> {
    return await this.provider.connection.getTokenAccountBalance(account);
  }

  public async get_quo_balance(): Promise<any> {
    return await this.get_balance(this.quoteAta);
  }

  public async get_col_balance(): Promise<any> {
    return await this.get_balance(this.collateralAta);
  }

  public get_ata(mint: PublicKey): PublicKey {
    return anchor.utils.token.associatedAddress({ mint, owner: this.key });
  }

  // public async get_ata_data(mint: PublicKey): Promise<any> {
  //   let ata = anchor.utils.token.getAssociatedTokenAddressSync(mint, this.key);
  //   return this.program.account.associatedTokenAccount.fetch(ata);
  // }

}