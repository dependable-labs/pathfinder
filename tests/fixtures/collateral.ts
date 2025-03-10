import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { MockPythPull } from "../../target/types/mock_pyth_pull";
import { BankrunProvider } from "anchor-bankrun";
import { create_custom_account } from "../utils";

const PythIDL = require("../../target/idl/mock_pyth_pull.json");

export const ORACLE_CONFIG = {
  "SOL": { // SOL-USDC
    pyth_id: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    sb_id: "56PpAg9fHx2yHEwdTkvCH5R5x2PAsDoNANUhdbvLXLM6",
    decimals: 9,
  },
  "BONK": { // BONK-USD
    pyth_id: "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
    sb_id: "7GCiue6chgGuk6BvaurQNWD1Ervho8zEdcNWt5ZCYQhu",
    decimals: 9,
  },
  "META": { // META-USD
    pyth_id: "0xe379d8d3a1a44952474f057bdfe6e902a97f093b2872c152dcf04f612e3e3be9",
    sb_id: "2o5GtpULRgktBvhHVVAjU6JZC5KNPagfgq8JfT85oVw5",
    decimals: 9,
  },
} as const;

export type SupportedCollateral = keyof typeof ORACLE_CONFIG;

export enum OracleSource {
  PythPull,
  SwitchboardPull
}

export class CollateralFixture {
  public oracleProgram: Program<MockPythPull>;
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public collateralMint: PublicKey;
  public symbol: SupportedCollateral;
  public oracleId: PublicKey;
  public oracleAcc: anchor.web3.Keypair;
  public ltvFactor: anchor.BN;
  public oracleSource: OracleSource;

  constructor(
    public _symbol: SupportedCollateral,
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _collateralMint: PublicKey,
    public _ltvFactor: anchor.BN,
    public _oracleSource: OracleSource = OracleSource.PythPull,
  ) {
    this.symbol = _symbol;
    this.program = _program;
    this.provider = _provider;
    this.collateralMint = _collateralMint;
    this.oracleProgram = new Program<MockPythPull>(PythIDL, this.provider)
    this.oracleAcc = new anchor.web3.Keypair();
    this.ltvFactor = _ltvFactor;
    this.oracleSource = _oracleSource;
  }

  getOracleId(): PublicKey {
    const config = ORACLE_CONFIG[this.symbol];
    const idString = this.oracleSource === OracleSource.PythPull 
      ? config.pyth_id 
      : config.sb_id;
      
    if (this.oracleSource === OracleSource.PythPull) {
      // Convert Pyth hex string to PublicKey
      const bytes = Buffer.from(idString.replace('0x', ''), 'hex');
      return new PublicKey(bytes);
    } else {
      // Switchboard ID is already in base58 format
      return new PublicKey(idString);
    }
  }

  getOracleSource(): OracleSource {
    return this.oracleSource;
  }

  getOracleAccount(): PublicKey {
    if (this.oracleSource === OracleSource.PythPull) {
      // account is the same accross all pyth feeds
      return this.oracleAcc.publicKey;
    } else {
      // account is pair specific for switchboard
      const config = ORACLE_CONFIG[this.symbol];
      return new PublicKey(config.sb_id);
    }
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
    if (this.oracleSource === OracleSource.PythPull) {
      await this.oracleProgram.methods.initialize(
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
    } else {

      // taken from solana account 7GCiue6chgGuk6BvaurQNWD1Ervho8zEdcNWt5ZCYQhu --output json-compact
      // ,"rentEpoch":18446744073709551615,"space":3208},"pubkey":"7GCiue6chgGuk6BvaurQNWD1Ervho8zEdcNWt5ZCYQhu"
      const SWITCHBOARD_ACCOUNT_DATA = Buffer.from("xBtsxArX2yjj5RMJAsPpwnkXeJdp8a4F3hXPUEZYvq/u0sWYqUmztx6OFhEAAAAAAAAAAAAAAADHdbD5SBAAAAAAAAAAAAAAogt0LO2rVe/R+vYK7yy4cqCS0k37qKSMi5U6XpCse78ejhYRAAAAAAAAAAAAAAAAx3Ww+UgQAAAAAAAAAAAAAG9edWasAAqVMOVrHbSVhXcnGa6q7q202b2MI1e4jp54fI4WEQAAAAAAAAAAAAAAACR2LsBLEAAAAAAAAAAAAACrYFSEI4rJPyJcZfJNdwW7dLAM21dlVcOZXhlmkaTeX6uMFhEAAAAAAAAAAAAAAADlsBSrRBAAAAAAAAAAAAAAXLqVPz8VNWsXcD5VTTmDgBkWUx15dqpCStZDSOxQ5CJ8jhYRAAAAAAAAAAAAAAAAUip2AUwQAAAAAAAAAAAAACDicLdDRz2H7/MhZj4me6HJoVH3lpzvgUf2Jemir3KHVo0WEQAAAAAAAAAAAAAAAB4MOkVIEAAAAAAAAAAAAADn7wJOp1b4vuwuqkAjQHDaNWdUqO6yrGoXwy0Xw+mfjfCLFhEAAAAAAAAAAAAAAADhQDkxRxAAAAAAAAAAAAAAFRljklc9yQQyQnFvYp1MD7k7wM/3oaEO3iQoGw6Y+32ujRYRAAAAAAAAAAAAAAAAnLN9bkcQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEisOCcfKKsbEuSUOb3fVIcQlOSDKlbHqOxXvRjTV5gAhoBwaEMvGGoUfPCxOjAGfThiBOqdbIsEdDrC7wELB1KBS3V93lngXV+saIhP/iWZNg0SRs5coSySmr3kX7dwPJIssmYAAAAAAAAAAAAAAAAA5AtUAgAAAAIAAABCT05LL1VTRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK4XdFmAAAAANjGzRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADHdbD5SBAAAAAAAAAAAAAAcgG1xAEAAAAAAAAAAAAAALcM59NJEAAAAAAAAAAAAAC2dviSBAAAAAAAAAAAAAAAnLN9bkcQAAAAAAAAAAAAAFIqdgFMEAAAAAAAAAAAAAAFAAAAAAAAAB6OFhEAAAAAro0WEQAAAAB8jhYRAAAAAPoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==", "base64");
      create_custom_account(
        this.provider.context,
        this.getOracleAccount(),
        new PublicKey("SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv"),
        23218560,
        SWITCHBOARD_ACCOUNT_DATA,
        18446744073709551615
      )
    }
  }
  
  async setPrice({
    price,
    conf
  }: {
    price: anchor.BN,
    conf: anchor.BN
  }) {
    if (this.oracleSource === OracleSource.PythPull) {
      await this.oracleProgram.methods.setPrice(
        price,
        conf,
      ).accounts({
        price: this.oracleAcc.publicKey,
      })
      .rpc();
    }

    // can't modify switchboard price oracle

  }
}
