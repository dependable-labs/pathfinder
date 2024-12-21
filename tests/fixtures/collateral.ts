import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { MockPythPull } from "../../target/types/mock_pyth_pull";
import { AccountFixture } from "./account";
import { BankrunProvider } from "anchor-bankrun";

const PythIDL = require("../../target/idl/mock_pyth_pull.json");

export const ORACLE_CONFIG = {
  "SOL": { // SOL-USDC
    id: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    decimals: 9,
  },
  "BONK": { // BONK-USD
    id: "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
    decimals: 9,
  },
  "META": { // META-USD
    id: "0xe379d8d3a1a44952474f057bdfe6e902a97f093b2872c152dcf04f612e3e3be9",
    decimals: 9,
  },
} as const;

export type SupportedCollateral = keyof typeof ORACLE_CONFIG;

export class CollateralFixture {
  public mockPythPull: Program<MockPythPull>;
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public collateralAcc: AccountFixture;
  public collateralMint: PublicKey;
  public symbol: SupportedCollateral;
  public oracleId: PublicKey;
  public oracleAcc: anchor.web3.Keypair;

  constructor(
    public _symbol: SupportedCollateral,
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _collateralAddress: PublicKey,
    public _collateralMint: PublicKey,
  ) {
    this.symbol = _symbol;
    this.program = _program;
    this.provider = _provider;
    this.collateralAcc = new AccountFixture(
      "collateral",
      _collateralAddress,
      _program,
    );
    this.collateralMint = _collateralMint;
    this.mockPythPull = new Program<MockPythPull>(
      PythIDL,
      this.provider,
    );
    this.oracleAcc = new anchor.web3.Keypair();
  }

  getOracleId(): string {
    return ORACLE_CONFIG[this.symbol].id;
  }

  getOracleAccount(): PublicKey {
    return this.oracleAcc.publicKey;
  }

  getDecimals(): number {
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
    conf
  }: {
    price: anchor.BN,
    conf: anchor.BN
  }) {
    await this.mockPythPull.methods.setPrice(
      price,
      conf,
    ).accounts({
      price: this.oracleAcc.publicKey,
    })
    .rpc();
  }

  public get_borrower_shares(userKey: PublicKey): AccountFixture {

    let borrowerSharesKey = PublicKey.findProgramAddressSync(
      [
        Buffer.from("borrower_shares"),
        this.collateralAcc.key.toBuffer(),
        userKey.toBuffer(),
      ],
      this.program.programId
    )[0];

    return new AccountFixture(
      "borrowerShares",
      borrowerSharesKey,
      this.program
    );
  }

}
