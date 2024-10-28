import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  LAMPORTS_PER_SOL,
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

// export const createTokenAccount = async (
//   provider: anchor.AnchorProvider,
//   user: anchor.web3.PublicKey,
//   mint: anchor.web3.PublicKey,
//   fundingAmount?: number
// ): Promise<anchor.web3.PublicKey> => {
//   const userAssociatedTokenAccount = await getAssociatedTokenAddress(
//     mint,
//     user,
//     false,
//     TOKEN_PROGRAM_ID,
//     ASSOCIATED_TOKEN_PROGRAM_ID
//   );

//   // Fund user with some SOL
//   let txFund = new anchor.web3.Transaction();
//   if (user.toBase58() !== provider.wallet.publicKey.toBase58()) {
//     txFund.add(
//       anchor.web3.SystemProgram.transfer({
//         fromPubkey: provider.wallet.publicKey,
//         toPubkey: user,
//         lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
//       })
//     );
//   }
//   txFund.add(
//     createAssociatedTokenAccount(
//       provider.wallet.publicKey,
//       userAssociatedTokenAccount,
//       user,
//       mint,
//       TOKEN_PROGRAM_ID,
//       ASSOCIATED_TOKEN_PROGRAM_ID
//     )
//   );
//   if (fundingAmount !== undefined) {
//     txFund.add(
//       mintTo(
//         mint,
//         userAssociatedTokenAccount,
//         provider.wallet.publicKey,
//         fundingAmount,
//         [],
//         TOKEN_PROGRAM_ID
//       )
//     );
//   }

//   const txFundTokenSig = await provider.sendAndConfirm(txFund, [], COMMITMENT);
//   console.log(
//     `[${userAssociatedTokenAccount.toBase58()}] New associated account for mint ${mint.toBase58()}: ${txFundTokenSig}`
//   );
//   return userAssociatedTokenAccount;
// };

// export const createSPLMint = async (
//   provider: BankrunProvider
// ): Promise<anchor.web3.PublicKey> => {
//   const wallet = provider.wallet;
//   const connection = provider.connection;

//   // Create the mint account
//   // const mint = await createMint(
//   //   connection,
//   //   wallet.payer,
//   //   wallet.publicKey,
//   //   wallet.publicKey,
//   //   9,
//   //   undefined,
//   //   { commitment: COMMITMENT.commitment },
//   //   TOKEN_PROGRAM_ID
//   // );
//   const mint = await createMint(
//     connection,
//     wallet.payer,
//     wallet.publicKey,
//     wallet.publicKey,
//     9,
//     undefined,
//     { commitment: COMMITMENT.commitment },
//     TOKEN_PROGRAM_ID
//   );

//   console.log(`[${mint.toBase58()}] Created new mint account`);
//   return mint;
// };

export async function getPDAs({
  programId,
  collateral,
  quote,
  owner,
}: {
  programId: PublicKey;
  collateral: PublicKey;
  quote: PublicKey;
  owner: PublicKey;
}) {
  const [market] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), quote.toBuffer()],
    programId
  );

  const [collateralCustom] = PublicKey.findProgramAddressSync(
    [Buffer.from("market_collateral"), market.toBuffer(), collateral.toBuffer()],
    programId
  );

  const [collateralAta] = PublicKey.findProgramAddressSync(
    [market.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), collateral.toBuffer()],
    anchor.utils.token.ASSOCIATED_PROGRAM_ID
  );

  const [quoteAta] = PublicKey.findProgramAddressSync(
    [market.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), quote.toBuffer()],
    anchor.utils.token.ASSOCIATED_PROGRAM_ID
  );

  const [userShares] = PublicKey.findProgramAddressSync(
    [Buffer.from("market_shares"), market.toBuffer(), owner.toBuffer()],
    programId
  );

  return {
    market,
    collateralCustom,
    collateralAta,
    quoteAta,
    userShares,
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

  const { market, collateralCustom, collateralAta, quoteAta, userShares } = await getPDAs({
    programId: program.programId,
    collateral: collateralMint,
    quote: quoteMint,
    owner,
  });

  return {
    program,
    provider,
    accounts: {
      owner,
      collateralMint,
      quoteMint,
      market,
      collateralCustom,
      collateralAta,
      quoteAta,
      userShares,
    },
  };
}
