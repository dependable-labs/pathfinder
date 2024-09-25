import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
// Update the import path if necessary
import { Markets } from "../target/types/markets";
import { createMint, createTokenAccount, getPDAs } from "./utils";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("#create_market", async () => {
  it("creates a market", async () => {
    // Set up the provider and program
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Markets as Program<Markets>;

    // wallet public key already has funds
    const owner = provider.wallet.publicKey;
    const collateralMint = await createMint(provider);
    const collateralOwnerTokenAccount = await createTokenAccount(
      provider,
      owner,
      collateralMint,
      100_000 * LAMPORTS_PER_SOL
    );

    const quoteMint = await createMint(provider);
    const quoteOwnerTokenAccount = await createTokenAccount(
      provider,
      owner,
      quoteMint,
      100_000 * LAMPORTS_PER_SOL
    );

    // Define the accounts required for the transaction
    const { market, marketAuthority, lpMint, collateralAta, quoteAta } = await getPDAs({
      programId: program.programId,
      collateral: collateralMint,
      quote: quoteMint,
    });

    // Execute the transaction to create the market
    await program.methods
      .createMarket({
        lltv: new anchor.BN(100),
      })
      .accounts({
        owner,
        market,
        marketAuthority,
        lpMint,
        collateralMint,
        vaultAtaCollateral: collateralAta,
        quoteMint,
        vaultAtaQuote: quoteAta,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Fetch the created market account
    const marketAccount = await program.account.market.fetch(market);

    // Assert that the market account was created with the correct values
    assert.equal(marketAccount.lpMint.toBase58(), lpMint.toBase58());
    assert.equal(marketAccount.collateralMint.toBase58(), collateralMint.toBase58());
    assert.equal(marketAccount.collateralMintDecimals, 9, "Collateral mint decimals should be 9");
    assert.equal(marketAccount.quoteMint.toBase58(), quoteMint.toBase58());
    assert.equal(marketAccount.quoteMintDecimals, 9, "Quote mint decimals should be 9");
    assert.equal(marketAccount.collateralAmount.toNumber(), 0);
    assert.equal(marketAccount.quoteAmount.toNumber(), 0);

    // Check that the lltv value is set correctly
    assert.equal(marketAccount.lltv.toString(), '100', "LLTV should be set to 100");

    console.log("Market created successfully with correct LLTV and mint decimals");
  });
});
