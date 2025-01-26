import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Finality,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createMint } from "spl-token-bankrun";

import { Markets } from "../target/types/markets";
import { BankrunProvider } from 'anchor-bankrun';
import { ProgramTestContext, Clock, BanksClient} from "solana-bankrun";
import { ControllerFixture } from "./fixtures/controller";
const IDL = require("../target/idl/markets.json");

export const COMMITMENT: { commitment: Finality } = { commitment: "confirmed" };

export interface PDAAccounts {
  market: PublicKey;
  collateralCustom: PublicKey;
  collateralAta: PublicKey;
  quoteAta: PublicKey;
  userShares: PublicKey;
}

export async function getPDAs({
  programId,
  collateral,
  quote,
}: {
  programId: PublicKey;
  collateral: PublicKey;
  quote: PublicKey;
}) {
  const [market] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), quote.toBuffer(), collateral.toBuffer()],
    programId
  );

  return {
    market,
  };
}

export async function setupTest({
  provider,
  banks,
  quoteDecimals,
  collateralDecimals
}: {
  provider: BankrunProvider,
  banks: BanksClient,
  quoteDecimals: number,
  collateralDecimals: number
}) {

  const program = new Program<Markets>(
    IDL,
    provider
  );

  const owner = provider.wallet.publicKey;
  const payer = provider.wallet.payer;

  const collateralMint = await createMint(
    banks,
    payer,
    owner,
    owner,
    collateralDecimals
  );

  const quoteMint = await createMint(
    banks,
    payer,
    owner,
    owner,
    quoteDecimals
  );

  const { market, collateralAcc } = await getPDAs({
    programId: program.programId,
    collateral: collateralMint,
    quote: quoteMint,
  });

  return {
    program,
    accounts: {
      owner,
      collateralMint,
      quoteMint,
      market,
      collateralAcc,
    },
  };
}
export async function createTokenAndAccounts(provider: BankrunProvider, banks: any) {
  const owner = provider.wallet.publicKey;
  const payer = provider.wallet.payer;

  const collateralMint = await createMint(
    banks,
    payer,
    owner,
    owner,
    9);

  const quoteMint = await createMint(
    banks,
    payer,
    owner,
    owner,
    9);

  const { market } = await getPDAs({
    programId: program.programId,
    collateral: collateralMint,
    quote: quoteMint,
  });

  return {
    collateralMint,
    quoteMint,
    market,
    collateralCustom,
  };
}

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

  async moveTimeForward(context: ProgramTestContext, seconds: number): Promise<void> {
    const currentClock = await context.banksClient.getClock();
    const newUnixTimestamp = currentClock.unixTimestamp + BigInt(seconds);
    const newClock = new Clock(
			currentClock.slot,
			currentClock.epochStartTimestamp,
			currentClock.epoch,
			currentClock.leaderScheduleEpoch,
			newUnixTimestamp
    );
    context.setClock(newClock);
  }
};

export class FixFactory {
  protected constructor(
    public program: Program<Markets>,
    public provider: BankrunProvider,
    public context: ProgramTestContext,

  ) {}

  public static async init({
    provider,
    banks,
    quoteDecimals = 9,
    collateralDecimals = 9,
  }: {
    provider: BankrunProvider,
    banks: BanksClient,
    quoteDecimals?: number,
    collateralDecimals?: number,
  }): Promise<TestFactory> {

    const program = new Program<Markets>(
      IDL,
      provider
    );
  
    const owner = provider.wallet.publicKey;
    const payer = provider.wallet.payer;
  
    const collateralMint = await createMint(
      banks,
      payer,
      owner,
      owner,
      collateralDecimals
    );
  
    const quoteMint = await createMint(
      banks,
      payer,
      owner,
      owner,
      quoteDecimals
    );

    let controller = new ControllerFixture(
      program,
      provider
    );

    const accounts = {
      owner,
      collateralMint,
      quoteMint,
      controller,
    };
  }
}


