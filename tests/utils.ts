import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  Connection,
  LAMPORTS_PER_SOL,
  Finality,
  TransactionSignature
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMint as createSPLMint,
  getMinimumBalanceForRentExemptMint,
  createMintToInstruction,
} from "@solana/spl-token";

export const COMMITMENT: { commitment: Finality } = { commitment: "confirmed" };

export interface PDAAccounts {
  market: PublicKey;
  marketAuthority: PublicKey;
  lpMint: PublicKey;
  collateralAta: PublicKey;
  quoteAta: PublicKey;
}

export const createTokenAccount = async (
  provider: anchor.AnchorProvider,
  user: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
  fundingAmount?: number
): Promise<anchor.web3.PublicKey> => {
  const userAssociatedTokenAccount = await getAssociatedTokenAddress(
    mint,
    user,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Fund user with some SOL
  let txFund = new anchor.web3.Transaction();
  if (user.toBase58() !== provider.wallet.publicKey.toBase58()) {
    txFund.add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: user,
        lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
  }
  txFund.add(
    createAssociatedTokenAccountInstruction(
      provider.wallet.publicKey,
      userAssociatedTokenAccount,
      user,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  if (fundingAmount !== undefined) {
    txFund.add(
      createMintToInstruction(
        mint,
        userAssociatedTokenAccount,
        provider.wallet.publicKey,
        fundingAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  const txFundTokenSig = await provider.sendAndConfirm(txFund, [], COMMITMENT);
  console.log(
    `[${userAssociatedTokenAccount.toBase58()}] New associated account for mint ${mint.toBase58()}: ${txFundTokenSig}`
  );
  return userAssociatedTokenAccount;
};

export const createMint = async (
  provider: anchor.AnchorProvider
): Promise<anchor.web3.PublicKey> => {
  const wallet = provider.wallet;
  const connection = provider.connection;

  // Create the mint account
  const mint = await createSPLMint(
    connection,
    wallet.payer,
    wallet.publicKey,
    wallet.publicKey,
    9,
    undefined,
    { commitment: COMMITMENT.commitment },
    TOKEN_PROGRAM_ID
  );

  console.log(`[${mint.toBase58()}] Created new mint account`);
  return mint;
};

export const getPDAs = async (params: {
  programId: anchor.web3.PublicKey;
  quote: anchor.web3.PublicKey;
  collateral: anchor.web3.PublicKey;
}): Promise<PDAAccounts> => {
    const [marketPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("market__"), params.quote.toBuffer(), params.collateral.toBuffer()],
      params.programId
    );

    const [marketAuthorityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("market_authority"), marketPda.toBuffer()],
      params.programId
    );

    const [lpMintPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("market_lp_mint"), marketAuthorityPda.toBuffer()],
      params.programId
    );

    const collateralAta = await getAssociatedTokenAddress(
      params.collateral,
      marketAuthorityPda,
      true // allowOwnerOffCurve = true for PDA
    );

    const quoteAta = await getAssociatedTokenAddress(
      params.quote,
      marketAuthorityPda,
      true // allowOwnerOffCurve = true for PDA
    );

    return {
      market: marketPda,
      marketAuthority: marketAuthorityPda,
      lpMint: lpMintPda,
      collateralAta,
      quoteAta,
    };
};