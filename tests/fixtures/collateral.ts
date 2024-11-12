import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { MockPythPull } from "../../target/types/mock_pyth_pull";
import { AccountFixture } from "./account";
import { BankrunProvider } from "anchor-bankrun";
import { ProgramTestContext } from "solana-bankrun";
import { assert } from "chai";
import { oracleUtils } from "../utils";

const PythIDL = require("../../target/idl/mock_pyth_pull.json");

export const ORACLE_CONFIG = {
  "SOL": { // SOL-USDC
    id: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    account: "DBE3N8uNjhKPRHfANdwGvCZghWXyLPdqdSbEW2XFwBiX",
    decimals: 9,
  },
  "JITO": { // JITO-USDC
    id: "0x4d1f0dd42d8ad3c88f78c6d39281ba0c0c6d8f2dbf91752a55275c16e2045f3b",
    account: "DBE3N8uNjhKPRHfANdwGvCZghWXyLPdqdSbEW2XFwBiX",
    decimals: 9,
  },
  "BONK": { // BONK-USD
    id: "72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
    account: "DBE3N8uNjhKPRHfANdwGvCZghWXyLPdqdSbEW2XFwBiX",
    decimals: 9,
  },
} as const;

export type SupportedCollateral = keyof typeof ORACLE_CONFIG;

export class CollateralFixture {
  public mockPythPull: Program<MockPythPull>;
  public provider: BankrunProvider;
  public context: ProgramTestContext;
  public collateralAcc: AccountFixture;
  public collateralMint: PublicKey;
  public symbol?: SupportedCollateral;
  public oracleId?: PublicKey;
  public oracleAcc: anchor.web3.Keypair;

  constructor(
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _context: ProgramTestContext,
    public collateralAddress: PublicKey,
    public _collateralMint: PublicKey,
  ) {
    this.provider = _provider;
    this.context = _context;
    this.collateralAcc = new AccountFixture(
      "collateral",
      collateralAddress,
      _program,
      _provider
    );
    this.collateralMint = _collateralMint;
    this.mockPythPull = new Program<MockPythPull>(
      PythIDL,
      this.provider,
    );
    this.oracleAcc = new anchor.web3.Keypair();
  }

  setSymbol(symbol: SupportedCollateral) {
    this.symbol = symbol;
  }

  getOracleId(): string {
    // if (!this.symbol) {
    //   throw new Error("Collateral symbol not set");
    // }
    return "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419"
    // return this.oracleId;
  }

  getOracleAccount(): PublicKey {
    return this.oracleAcc.publicKey;
  }

  getDecimals(): number {
    if (!this.symbol) {
      throw new Error("Collateral symbol not set");
    }
    return ORACLE_CONFIG[this.symbol].decimals;
  }

  async initPrice({
    price,
    conf,
    expo
  }: {
    price: anchor.BN,
    conf: anchor.BN,
    expo: number
  }) {
    await this.mockPythPull.methods.initialize(
      this.getOracleId(),
      price,
      conf,
      expo,
    ).accounts({
      payer: this.provider.wallet.publicKey,
      price: this.oracleAcc.publicKey,
    })
    .signers([this.oracleAcc])
    .rpc();
  }
  
  async setPrice({
    price,
    confidence
  }: {
    price: anchor.BN,
    confidence: anchor.BN
  }) {
    await this.mockPythPull.methods.setPrice(
      price,
      confidence,
    ).accounts({
      price: this.oracleAcc.publicKey,
    })
    .rpc();
  }
}
