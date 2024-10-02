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

    const { market, collateralAta, quoteAta } = await getPDAs({
      programId: program.programId,
      collateral: collateralMint,
      quote: quoteMint,
      owner,
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
    assert.equal(marketAccount.collateralMint.toBase58(), collateralMint.toBase58());
    assert.equal(marketAccount.collateralMintDecimals, 9, "Collateral mint decimals should be 9");
    assert.equal(marketAccount.quoteMint.toBase58(), quoteMint.toBase58());
    assert.equal(marketAccount.quoteMintDecimals, 9, "Quote mint decimals should be 9");
    assert.equal(marketAccount.totalCollateral.toNumber(), 0);
    assert.equal(marketAccount.totalQuote.toNumber(), 0);

    // Check that the lltv value is set correctly
    assert.equal(marketAccount.lltv.toString(), '100', "LLTV should be set to 100");

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
  //   // const pythPriceAccount = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");

    const { market, collateralAta, quoteAta, userShares } = await getPDAs({
      programId: program.programId,
      collateral: collateralMint,
      quote: quoteMint,
      owner,
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

    await program.methods
      .deposit({
        amount: depositAmount,
        shares: new anchor.BN(0),
      })
      .accounts({
        depositor: owner,
        market,
        userShares,
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
      updatedMarketAccount.totalQuote.toString(),
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

    // Fetch the UserShares account for the owner
    const userSharesAccount = await program.account.userShares.fetch(userShares);

    // Assert that the user's shares balance has increased and matches the total shares
    assert.ok(
      userSharesAccount.shares.gt(new anchor.BN(0)),
      "User's shares balance should have increased after deposit"
    );
    assert.equal(
      userSharesAccount.shares.toString(),
      updatedMarketAccount.totalShares.toString(),
      "User's shares should match the total shares in the market"
    );

    // This assumes that for the initial deposit, shares == amount (as per the contract logic)
    assert.ok(
      userSharesAccount.shares.eq(depositAmount),
      "User's shares should equal the deposit amount for the initial deposit"
    );

});
});
