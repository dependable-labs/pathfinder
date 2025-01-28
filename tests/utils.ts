import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createHash } from "crypto";
import {
  PublicKey,
  Finality,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createMint } from "spl-token-bankrun";

import { Markets } from "../target/types/markets";
import { startAnchor, BankrunProvider } from 'anchor-bankrun';
import { ProgramTestContext, Clock, BanksClient} from "solana-bankrun";
import { ControllerFixture } from "./fixtures/controller";
import { UserFixture, MarketFixture, CollateralFixture, SupportedCollateral } from "./fixtures";
const IDL = require("../target/idl/markets.json");

export const COMMITMENT: { commitment: Finality } = { commitment: "confirmed" };

// export interface PDAAccounts {
//   market: PublicKey;
//   collateralCustom: PublicKey;
//   collateralAta: PublicKey;
//   quoteAta: PublicKey;
//   userShares: PublicKey;
// }

// export async function getPDAs({
//   programId,
//   collateral,
//   quote,
// }: {
//   programId: PublicKey;
//   collateral: PublicKey;
//   quote: PublicKey;
// }) {
//   const [market] = PublicKey.findProgramAddressSync(
//     [Buffer.from("market"), quote.toBuffer(), collateral.toBuffer()],
//     programId
//   );

//   return {
//     market,
//   };
// }

// export async function setupTest({
//   provider,
//   banks,
//   quoteDecimals,
//   collateralDecimals
// }: {
//   provider: BankrunProvider,
//   banks: BanksClient,
//   quoteDecimals: number,
//   collateralDecimals: number
// }) {

//   const program = new Program<Markets>(
//     IDL,
//     provider
//   );

//   const owner = provider.wallet.publicKey;
//   const payer = provider.wallet.payer;

//   const collateralMint = await createMint(
//     banks,
//     payer,
//     owner,
//     owner,
//     collateralDecimals
//   );

//   const quoteMint = await createMint(
//     banks,
//     payer,
//     owner,
//     owner,
//     quoteDecimals
//   );

//   const { market, collateralAcc } = await getPDAs({
//     programId: program.programId,
//     collateral: collateralMint,
//     quote: quoteMint,
//   });

//   return {
//     program,
//     accounts: {
//       owner,
//       collateralMint,
//       quoteMint,
//       market,
//       collateralAcc,
//     },
//   };
// }
// export async function createTokenAndAccounts(provider: BankrunProvider, banks: any) {
//   const owner = provider.wallet.publicKey;
//   const payer = provider.wallet.payer;

//   const collateralMint = await createMint(
//     banks,
//     payer,
//     owner,
//     owner,
//     9);

//   const quoteMint = await createMint(
//     banks,
//     payer,
//     owner,
//     owner,
//     9);

//   const { market } = await getPDAs({
//     programId: program.programId,
//     collateral: collateralMint,
//     quote: quoteMint,
//   });

//   return {
//     collateralMint,
//     quoteMint,
//     market,
//     collateralCustom,
//   };
// }

export function fund_w_sol(
  context: ProgramTestContext,
  pubkey: PublicKey,
  sol_amount: number
) {
  context.setAccount(pubkey, {
    executable: false,
    owner: anchor.web3.SystemProgram.programId,
    lamports: LAMPORTS_PER_SOL * sol_amount,
    data: Buffer.alloc(0),
  });
}

export const TimeUtils = {

};

export function deriveMarketAddress(
  quoteMint: PublicKey,
  collateralMint: PublicKey,
  ltvFactor: anchor.BN,
  oracleId: string,
  programId: PublicKey
) {

  const hash = createHash('sha256')
    .update(oracleId)
    .digest();

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      quoteMint.toBuffer(),
      collateralMint.toBuffer(),
      Buffer.from(ltvFactor.toArray("le", 8)),
      hash,
    ],
    programId
  )[0];
}

export class TestUtils {
  private static program: Program<Markets>;
  private static provider: BankrunProvider;
  private static banks: BanksClient;
  private static context: ProgramTestContext;
  private static quoteMint: PublicKey;
  private static collateralMint: PublicKey;

  constructor() {}

  public static async init({
    quoteDecimals = 9,
    collateralDecimals = 9,
  }: {
    quoteDecimals?: number,
    collateralDecimals?: number,
  }): Promise<TestUtils> {

    const context = await startAnchor('', [], []);
    TestUtils.provider = new BankrunProvider(context);
    TestUtils.program = new Program<Markets>(IDL, TestUtils.provider);
    TestUtils.banks = context.banksClient;
    TestUtils.context = context;

    const owner = TestUtils.provider.wallet.publicKey;
    const payer = TestUtils.provider.wallet.payer;

    TestUtils.quoteMint = await createMint(
      TestUtils.banks,
      payer,
      owner,
      owner,
      quoteDecimals
    );
  
    TestUtils.collateralMint = await createMint(
      TestUtils.banks,
      payer,
      owner,
      owner,
      collateralDecimals
    );
  
    return TestUtils;
  }

  public static createUser() {
    return new UserFixture(
      TestUtils.provider,
      TestUtils.quoteMint,
      TestUtils.collateralMint
    );
  }

  public static async createMarket(
    {
      symbol,
      ltvFactor,
      price,
      conf,
      expo
    }: {
      symbol: string,
      ltvFactor: anchor.BN,
      price: anchor.BN,
      conf: anchor.BN,
      expo: number
    }
  ) {

    const collateral = new CollateralFixture(
      symbol as SupportedCollateral,
      TestUtils.program,
      TestUtils.provider,
      TestUtils.collateralMint,
      ltvFactor
    );

    await collateral.initPrice({
      price,
      conf,
      expo
    });

    const controller = new ControllerFixture(
      TestUtils.program,
      TestUtils.provider,
    );

    return new MarketFixture(
      TestUtils.program,
      TestUtils.provider,
      TestUtils.quoteMint,
      TestUtils.collateralMint,
      symbol as SupportedCollateral,
      collateral,
      controller
    );
  }

  // time utils
  public static async moveTimeForward(seconds: number): Promise<void> {
    const currentClock = await TestUtils.context.banksClient.getClock();
    const newUnixTimestamp = currentClock.unixTimestamp + BigInt(seconds);
    const newClock = new Clock(
			currentClock.slot,
			currentClock.epochStartTimestamp,
			currentClock.epoch,
			currentClock.leaderScheduleEpoch,
			newUnixTimestamp
    );
    TestUtils.context.setClock(newClock);
  }

  public static async getTime(): Promise<number> {
    const currentClock = await TestUtils.context.banksClient.getClock();
    return Number(currentClock.unixTimestamp);
  }
}


