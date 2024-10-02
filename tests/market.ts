import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { Markets } from "../target/types/markets";
import { createMint, createTokenAccount, getPDAs } from "./utils";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

describe("Market Operations", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Markets as Program<Markets>;

  const INITIAL_TOKEN_AMOUNT = 100_000 * LAMPORTS_PER_SOL;
  const PYTH_SOL_USD_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

  async function setupMarket() {
    const owner = provider.wallet.publicKey;
    const collateralMint = await createMint(provider);
    const quoteMint = await createMint(provider);

    const collateralOwnerTokenAccount = await createTokenAccount(
      provider,
      owner,
      collateralMint,
      INITIAL_TOKEN_AMOUNT
    );

    const quoteOwnerTokenAccount = await createTokenAccount(
      provider,
      owner,
      quoteMint,
      INITIAL_TOKEN_AMOUNT
    );

    const { market, collateralAta, quoteAta, userShares } = await getPDAs({
      programId: program.programId,
      collateral: collateralMint,
      quote: quoteMint,
      owner,
    });

    return {
      owner,
      collateralMint,
      quoteMint,
      collateralOwnerTokenAccount,
      quoteOwnerTokenAccount,
      market,
      collateralAta,
      quoteAta,
      userShares,
    };
  }

  async function createMarket(accounts: any) {
    await program.methods
      .createMarket({
        oracle: PYTH_SOL_USD_ID,
        lltv: new anchor.BN(100),
      })
      .accounts({
        owner: accounts.owner,
        market: accounts.market,
        collateralMint: accounts.collateralMint,
        vaultAtaCollateral: accounts.collateralAta,
        quoteMint: accounts.quoteMint,
        vaultAtaQuote: accounts.quoteAta,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  async function deposit(accounts: any, amount: anchor.BN) {
    await program.methods
      .deposit({
        amount,
        shares: new anchor.BN(0),
      })
      .accounts({
        depositor: accounts.owner,
        market: accounts.market,
        userShares: accounts.userShares,
        quoteMint: accounts.quoteMint,
        vaultAtaQuote: accounts.quoteAta,
        depositorAtaQuote: accounts.quoteOwnerTokenAccount,
        collateralMint: accounts.collateralMint,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  it("creates a market", async () => {
    const accounts = await setupMarket();
    await createMarket(accounts);

    const marketAccount = await program.account.market.fetch(accounts.market);

    assert.equal(marketAccount.collateralMint.toBase58(), accounts.collateralMint.toBase58());
    assert.equal(marketAccount.collateralMintDecimals, 9, "Collateral mint decimals should be 9");
    assert.equal(marketAccount.quoteMint.toBase58(), accounts.quoteMint.toBase58());
    assert.equal(marketAccount.quoteMintDecimals, 9, "Quote mint decimals should be 9");
    assert.equal(marketAccount.totalCollateral.toNumber(), 0);
    assert.equal(marketAccount.totalQuote.toNumber(), 0);
    assert.equal(marketAccount.lltv.toString(), '100', "LLTV should be set to 100");
  });

  it("deposits", async () => {
    const accounts = await setupMarket();
    await createMarket(accounts);

    const depositAmount = new anchor.BN(100 * LAMPORTS_PER_SOL);
    await deposit(accounts, depositAmount);

    // Verify that the total quote in the market matches the deposited amount
    const updatedMarketAccount = await program.account.market.fetch(accounts.market);
    assert.equal(updatedMarketAccount.totalQuote.toString(), depositAmount.toString(), "Market quote amount should be equal to the deposited amount");

    // Verify that the vault's balance has increased by the deposit amount
    const updatedVaultQuoteBalance = await provider.connection.getTokenAccountBalance(accounts.quoteAta);
    assert.equal(updatedVaultQuoteBalance.value.amount, depositAmount.toString(), "Vault quote balance should have increased by the deposit amount");

    // Verify that the owner's balance has decreased by the deposit amount
    const updatedOwnerQuoteBalance = await provider.connection.getTokenAccountBalance(accounts.quoteOwnerTokenAccount);
    const expectedOwnerBalance = new anchor.BN(INITIAL_TOKEN_AMOUNT).sub(depositAmount);
    assert.equal(updatedOwnerQuoteBalance.value.amount, expectedOwnerBalance.toString(), "Owner's quote balance should have decreased by the deposit amount");

    const userSharesAccount = await program.account.userShares.fetch(accounts.userShares);
    // Verify that the user has received shares for their deposit
    assert.ok(userSharesAccount.shares.gt(new anchor.BN(0)), "User's shares balance should have increased after deposit");
    // Verify that the user's shares match the total shares in the market
    assert.equal(userSharesAccount.shares.toString(), updatedMarketAccount.totalShares.toString(), "User's shares should match the total shares in the market");
  });
});