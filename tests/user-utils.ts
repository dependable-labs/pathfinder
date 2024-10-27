import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../target/types/markets";
import { createTokenAccount } from "./utils";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const INITIAL_TOKEN_AMOUNT = 100_000 * LAMPORTS_PER_SOL;

export class UserFixture {
  public key: PublicKey;
  public program: Program<Markets>;
  public provider: anchor.AnchorProvider;
  public quoteMint: PublicKey;
  public quoteAta: PublicKey;
  public collateralMint: PublicKey;
  public collateralAta: PublicKey;

  public constructor(
    public _key: PublicKey,
    public _program: Program<Markets>,
    public _provider: anchor.AnchorProvider,
    public _quoteMint: PublicKey,
    public _collateralMint: PublicKey,
  ) {
    this.key = _key;
    this.program = _program;
    this.provider = _provider;
    this.quoteMint = _quoteMint;
    this.collateralMint = _collateralMint;
  }

  public async init_accounts(): Promise<void> {
    this.quoteAta = await createTokenAccount(
      this.provider,
      this.key,
      this.quoteMint,
      INITIAL_TOKEN_AMOUNT
    );

    this.collateralAta = await createTokenAccount(
      this.provider,
      this.key,
      this.collateralMint,
      INITIAL_TOKEN_AMOUNT
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

  // public async get_ata(mint: PublicKey): Promise<any> {
  //   // return anchor.web3.getAssociatedTokenAddress(mint, this.key);
  //   return anchor.utils.token.getAssociatedTokenAddressSync(mint, this.key);
  // }

  // public async get_ata_data(mint: PublicKey): Promise<any> {
  //   let ata = anchor.utils.token.getAssociatedTokenAddressSync(mint, this.key);
  //   return this.program.account.associatedTokenAccount.fetch(ata);
  // }

}