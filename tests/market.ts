import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { Markets } from "../target/types/markets";
import { createMint, createTokenAccount, getPDAs } from "./utils";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

describe("#create_market", async () => {
  it("creates a market", async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Markets as Program<Markets>;

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
    
    const PYTH_SOL_USD_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
    // const pythPriceAccount = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");

    const { market, lpMint, collateralAta, quoteAta } = await getPDAs({
      programId: program.programId,
      collateral: collateralMint,
      quote: quoteMint,
    });

    // Execute the transaction to create the market
    await program.methods
      .createMarket({
        oracle: PYTH_SOL_USD_ID,
        lltv: new anchor.BN(100),
      })
      .accounts({
        owner,
        market,
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

    // console.log("Market created successfully with correct LLTV and mint decimals");
  });

  it("deposits", async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Markets as Program<Markets>;

    const owner = provider.wallet.publicKey;
    const collateralMint = await createMint(provider);
    const collateralOwnerTokenAccount = await createTokenAccount(
      provider,
      owner,
      collateralMint,
      100_000 * LAMPORTS_PER_SOL
    );

    const INITIAL_QUOTE_AMOUNT = 100_000 * LAMPORTS_PER_SOL;
    const quoteMint = await createMint(provider);
    const quoteOwnerTokenAccount = await createTokenAccount(
      provider,
      owner,
      quoteMint,
      100_000 * LAMPORTS_PER_SOL
    );

    const PYTH_SOL_USD_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
    // const pythPriceAccount = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");

    const { market, lpMint, collateralAta, quoteAta } = await getPDAs({
      programId: program.programId,
      collateral: collateralMint,
      quote: quoteMint,
    });

    // Execute the transaction to create the market
    await program.methods
      .createMarket({
        oracle: PYTH_SOL_USD_ID,
        lltv: new anchor.BN(100),
      })
      .accounts({
        owner,
        market,
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

    // Deposit 100 quote tokens
    const depositAmount = new anchor.BN(100 * LAMPORTS_PER_SOL); // 100 tokens with 9 decimals

    const ownerAtaLp = await anchor.utils.token.associatedAddress({
      mint: lpMint,
      owner: owner,
    });

    await program.methods
      .deposit({
        amount: depositAmount,
      })
      .accounts({
        depositor: owner,
        market,
        lpMint,
        ownerAtaLp,
        quoteMint,
        vaultAtaQuote: quoteAta,
        depositorAtaQuote: quoteOwnerTokenAccount,
        collateralMint,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Assert accounting
    const updatedMarketAccount = await program.account.market.fetch(market);
    assert.equal(
      updatedMarketAccount.quoteAmount.toString(),
      depositAmount.toString(),
      "Market quote amount should be equal to the deposited amount"
    );

    // Assert that the vault ATA balance increased by the deposit amount
    const updatedVaultQuoteBalance = await provider.connection.getTokenAccountBalance(quoteAta);
    assert.equal(
      updatedVaultQuoteBalance.value.amount,
      depositAmount.toString(),
      "Vault quote balance should have increased by the deposit amount"
    );

    // Assert that the owner's quote token balance decreased by the deposit amount
    const updatedOwnerQuoteBalance = await provider.connection.getTokenAccountBalance(quoteOwnerTokenAccount);
    const expectedOwnerBalance = new anchor.BN(INITIAL_QUOTE_AMOUNT).sub(depositAmount);
    assert.equal(
      updatedOwnerQuoteBalance.value.amount,
      expectedOwnerBalance.toString(),
      "Owner's quote balance should have decreased by the deposit amount"
    );

    // Assert that LP tokens were minted to the owner
    const ownerLpBalance = await provider.connection.getTokenAccountBalance(ownerAtaLp);
    assert.equal(
      ownerLpBalance.value.amount,
      depositAmount.toString(),
      "Owner should have received LP tokens"
    ); 
  });

});
