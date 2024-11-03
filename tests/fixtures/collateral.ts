import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Markets } from "../../target/types/markets";
import * as anchor from "@coral-xyz/anchor";
import { AccountFixture } from "./account";
import { BankrunProvider } from "anchor-bankrun";
import { fund_w_sol } from "../utils";

export class CollateralFixture {
  public collateralKey: PublicKey;
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public collateralAcc: AccountFixture;
  public collateralMint: PublicKey;
  public collateralAta: PublicKey;

  public constructor(
    program: Program<Markets>,
    provider: BankrunProvider,
    collateralAddress: PublicKey,
    collateralMint: PublicKey,
  ) {

    this.program = program;
    this.collateralAcc = new AccountFixture(
      "collateral",
      collateralAddress,
      program,
      provider
    );
    this.provider = provider;
    this.collateralMint = collateralMint;
  }

}