import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Finality,
} from "@solana/web3.js";

import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createMint } from "spl-token-bankrun";

import { Markets } from "../target/types/markets";
import { BankrunProvider } from 'anchor-bankrun';

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
    [Buffer.from("market"), quote.toBuffer()],
    programId
  );

  const [collateralCustom] = PublicKey.findProgramAddressSync(
    [Buffer.from("market_collateral"), market.toBuffer(), collateral.toBuffer()],
    programId
  );

  return {
    market,
    collateralCustom,
  };
}

export async function setupTest(provider: BankrunProvider, banks: any) {
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
    9);

  const quoteMint = await createMint(
    banks,
    payer,
    owner,
    owner,
    9);

  const { market, collateralCustom } = await getPDAs({
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
      collateralCustom,
    },
  };
}
