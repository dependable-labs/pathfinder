import {
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BankrunProvider } from "anchor-bankrun";
import {
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "spl-token-bankrun";
import { fund_w_sol } from "../utils";

export class UserFixture {
  public key: anchor.Wallet;
  public provider: BankrunProvider;
  public quoteMint: PublicKey;
  public quoteAta: PublicKey;
  public collateralMint: PublicKey;
  public collateralAta: PublicKey;

  public constructor(
    public _provider: BankrunProvider,
    public _quoteMint: PublicKey,
    public _collateralMint: PublicKey
  ) {
    this.key = new anchor.Wallet(Keypair.generate());
    this.provider = _provider;
    this.quoteMint = _quoteMint;
    this.collateralMint = _collateralMint;
  }

  public async init_and_fund_accounts(
    quoteAmount: anchor.BN,
    collateralAmount: anchor.BN
  ): Promise<void> {
    await this.init_accounts();
    await this.fund_accounts(quoteAmount, collateralAmount);
    fund_w_sol(this.provider.context, this.key.publicKey, 1 * LAMPORTS_PER_SOL);
  }

  private async init_accounts(): Promise<void> {
    this.quoteAta = await createAssociatedTokenAccount(
      this.provider.context.banksClient,
      this.provider.wallet.payer,
      this.quoteMint,
      this.key.publicKey
    );

    this.collateralAta = await createAssociatedTokenAccount(
      this.provider.context.banksClient,
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
      this.provider.context.banksClient,
      this.provider.wallet.payer,
      this.quoteMint,
      this.get_ata(this.quoteMint),
      this.provider.wallet.payer,
      quoteAmount
    );

    await mintTo(
      this.provider.context.banksClient,
      this.provider.wallet.payer,
      this.collateralMint,
      this.collateralAta,
      this.provider.wallet.payer,
      collateralAmount
    );
  }

  public async get_balance(account: PublicKey): Promise<any> {
    return await getAccount(this.provider.context.banksClient, account);
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
}
