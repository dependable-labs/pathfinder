import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BanksClient, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import {
  createAccount,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "spl-token-bankrun";
import { BN } from "@coral-xyz/anchor";

export class UserFixture {
  public key: anchor.Wallet;
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public context: ProgramTestContext;
  public quoteMint: PublicKey;
  public quoteAta: PublicKey;
  public collateralMint: PublicKey;
  public collateralAta: PublicKey;

  public constructor(
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _context: ProgramTestContext,
    public _quoteMint: PublicKey,
    public _collateralMint: PublicKey
  ) {
    this.key = new anchor.Wallet(Keypair.generate());
    this.program = _program;
    this.provider = _provider;
    this.context = _context;
    this.quoteMint = _quoteMint;
    this.collateralMint = _collateralMint;
  }

  public async init_and_fund_accounts(
    quoteAmount: anchor.BN,
    collateralAmount: anchor.BN
  ): Promise<void> {
    await this.init_accounts();
    await this.fund_accounts(quoteAmount, collateralAmount);
    this.fund_w_sol(1 * LAMPORTS_PER_SOL);
  }

  private async init_accounts(): Promise<void> {
    this.quoteAta = await createAssociatedTokenAccount(
      this.context.banksClient,
      this.provider.wallet.payer,
      this.quoteMint,
      this.key.publicKey
    );

    this.collateralAta = await createAssociatedTokenAccount(
      this.context.banksClient,
      this.provider.wallet.payer,
      this.collateralMint,
      this.key.publicKey
    );
  }

  private async fund_accounts(
    quoteAmount: anchor.BN,
    collateralAmount: anchor.BN
  ): Promise<void> {
    await mintTo(
      this.context.banksClient,
      this.provider.wallet.payer,
      this.quoteMint,
      this.get_ata(this.quoteMint),
      this.provider.wallet.payer,
      quoteAmount
    );

    await mintTo(
      this.context.banksClient,
      this.provider.wallet.payer,
      this.collateralMint,
      this.collateralAta,
      this.provider.wallet.payer,
      collateralAmount
    );
  }

  public fund_w_sol(sol_amount: number) {
    this.context.setAccount(this.key.publicKey, {
      executable: false,
      owner: anchor.web3.SystemProgram.programId,
      lamports: LAMPORTS_PER_SOL * sol_amount,
      data: Buffer.alloc(0),
    });
  }

  public async get_balance(account: PublicKey): Promise<any> {
    return await getAccount(this.context.banksClient, account);
  }

  public async get_quo_balance(): Promise<BigInt> {
    return (await this.get_balance(this.quoteAta)).amount
  }

  public async get_col_balance(): Promise<BigInt> {
    return (await this.get_balance(this.collateralAta)).amount
  }

  public get_ata(mint: PublicKey): PublicKey {
    return anchor.utils.token.associatedAddress({
      mint,
      owner: this.key.publicKey,
    });
  }

  // public async get_ata_data(mint: PublicKey): Promise<any> {
  //   let ata = anchor.utils.token.getAssociatedTokenAddressSync(mint, this.key);
  //   return this.program.account.associatedTokenAccount.fetch(ata);
  // }
}
