// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { assert } from "chai";
// import { Markets } from "../target/types/markets";
// import { createMint, createTokenAccount, getPDAs } from "./utils";
// import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

// describe("Market Operations", () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.Markets as Program<Markets>;

//   const INITIAL_TOKEN_AMOUNT = 100_000 * LAMPORTS_PER_SOL;
//   const PYTH_SOL_USD_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

//   async function setupMarket() {
//     const owner = provider.wallet.publicKey;
//     const collateralMint = await createMint(provider);
//     const quoteMint = await createMint(provider);

//     const collateralOwnerTokenAccount = await createTokenAccount(
//       provider,
//       owner,
//       collateralMint,
//       INITIAL_TOKEN_AMOUNT
//     );

//     const quoteOwnerTokenAccount = await createTokenAccount(
//       provider,
//       owner,
//       quoteMint,
//       INITIAL_TOKEN_AMOUNT
//     );

//     const { market, collateralCustom, collateralAta, quoteAta, userShares } = await getPDAs({
//       programId: program.programId,
//       collateral: collateralMint,
//       quote: quoteMint,
//       owner,
//     });

//     return {
//       owner,
//       collateralMint,
//       quoteMint,
//       collateralOwnerTokenAccount,
//       quoteOwnerTokenAccount,
//       market,
//       collateralCustom,
//       collateralAta,
//       quoteAta,
//       userShares,
//     };
//   }

//   async function createMarket(accounts: any) {
//     await program.methods
//       .createMarket({
//         oracle: PYTH_SOL_USD_ID,
//         lltv: new anchor.BN(100),
//       })
//       .accounts({
//         owner: accounts.owner,
//         market: accounts.market,
//         quoteMint: accounts.quoteMint,
//         vaultAtaQuote: accounts.quoteAta,
//         associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
//         tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .rpc();
//   }

//   async function addCollateral(accounts: any, oracle: string, cap: anchor.BN, rateFactor: anchor.BN ) {
//     await program.methods
//       .addCollateral({
//         oracle,
//         cap,
//         rateFactor,
//       })
//       .accounts({
//         authority: accounts.owner,
//         market: accounts.market,
//         collateral: accounts.collateralCustom,
//         collateralMint: accounts.collateralMint,
//         associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
//         tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .rpc();
//   }

//   async function deposit(accounts: any, amount: anchor.BN, shares: anchor.BN) {
//     await program.methods
//       .deposit({
//         amount,
//         shares,
//       })
//       .accounts({
//         user: accounts.owner,
//         market: accounts.market,
//         userShares: accounts.userShares,
//         quoteMint: accounts.quoteMint,
//         vaultAtaQuote: accounts.quoteAta,
//         userAtaQuote: accounts.quoteOwnerTokenAccount,
//         tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
//         associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .rpc();
//   }

//   async function withdraw(accounts: any, amount: anchor.BN, shares: anchor.BN) {
//     await program.methods
//       .withdraw({
//         amount,
//         shares,
//       })
//       .accounts({
//         user: accounts.owner,
//         market: accounts.market,
//         userShares: accounts.userShares,
//         quoteMint: accounts.quoteMint,
//         vaultAtaQuote: accounts.quoteAta,
//         userAtaQuote: accounts.quoteOwnerTokenAccount,
//         collateralMint: accounts.collateralMint,
//         tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
//         associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .rpc();
//   }

//   async function depositCollateral(accounts: any, amount: anchor.BN) {
//     await program.methods
//       .depositCollateral({
//         amount,
//       })
//       .accounts({
//         user: accounts.owner,
//         market: accounts.market,
//         collateral: accounts.collateralCustom,
//         userShares: accounts.userShares,
//         collateralMint: accounts.collateralMint,
//         vaultAtaCollateral: accounts.collateralAta,
//         userAtaCollateral: accounts.collateralOwnerTokenAccount,
//         tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
//         associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .rpc();
//   }

//   async function borrow(accounts: any, amount: anchor.BN, shares: anchor.BN) {
//     await program.methods
//       .borrow({
//         amount,
//         shares,
//       })
//       .accounts({
//         user: accounts.owner,
//         market: accounts.market,
//         userShares: accounts.userShares,
//         quoteMint: accounts.quoteMint,
//         vaultAtaQuote: accounts.quoteAta,
//         userAtaQuote: accounts.quoteOwnerTokenAccount,
//         collateral: accounts.collateralCustom,
//         collateralMint: accounts.collateralMint,
//         tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
//         associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .rpc();
//   }

//   it("creates a market", async () => {
//     const accounts = await setupMarket();
//     await createMarket(accounts);

//     const marketAccount = await program.account.market.fetch(accounts.market);

//     assert.equal(marketAccount.quoteMint.toBase58(), accounts.quoteMint.toBase58());
//     assert.equal(marketAccount.quoteMintDecimals, 9, "Quote mint decimals should be 9");
//     assert.equal(marketAccount.totalQuote.toNumber(), 0);
//     assert.equal(marketAccount.totalShares.toNumber(), 0);

//   });

//   it("adds collateral", async () => {
//     const accounts = await setupMarket();
//     await createMarket(accounts);

//     // Add collateral to the market
//     const oracleAddress = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // Replace with actual oracle address
//     const cap = new anchor.BN(1000 * LAMPORTS_PER_SOL); // Set an appropriate cap
//     const rateFactor = new anchor.BN(10000); // Set an appropriate rate factor
//     await addCollateral(accounts, oracleAddress, cap, rateFactor);

//     // Verify that the collateral was added successfully
//     const updatedCollateralAccount = await program.account.collateral.fetch(accounts.collateralCustom);
//     assert.equal(updatedCollateralAccount.mint.toBase58(), accounts.collateralMint.toBase58(), "Collateral mint should match");
//     assert.equal(updatedCollateralAccount.cap.toString(), cap.toString(), "Collateral cap should match");
//     assert.equal(updatedCollateralAccount.rateFactor.toString(), rateFactor.toString(), "Rate factor should match");
//     assert.equal(updatedCollateralAccount.totalCollateral.toString(), "0", "Total collateral should be zero initially");
//     assert.equal(updatedCollateralAccount.totalBorrowShares.toString(), "0", "Total borrow shares should be zero initially");
//     assert.equal(updatedCollateralAccount.totalBorrowAssets.toString(), "0", "Total borrow assets should be zero initially");
//     assert.ok(updatedCollateralAccount.oracle.feedId.every((byte, index) => byte === parseInt(oracleAddress.substr(index * 2, 2), 16)), "Oracle feed ID should match");
//   });

//   it("deposits", async () => {
//     const accounts = await setupMarket();
//     await createMarket(accounts);

//     const depositAmount = new anchor.BN(100 * LAMPORTS_PER_SOL);
//     const shares = new anchor.BN(0);
//     await deposit(accounts, depositAmount, shares);

//     // Verify that the total quote in the market matches the deposited amount
//     const updatedMarketAccount = await program.account.market.fetch(accounts.market);
//     assert.equal(updatedMarketAccount.totalQuote.toString(), depositAmount.toString(), "Market quote amount should be equal to the deposited amount");

//     // Verify that the vault's balance has increased by the deposit amount
//     const updatedVaultQuoteBalance = await provider.connection.getTokenAccountBalance(accounts.quoteAta);
//     assert.equal(updatedVaultQuoteBalance.value.amount, depositAmount.toString(), "Vault quote balance should have increased by the deposit amount");

//     // Verify that the owner's balance has decreased by the deposit amount
//     const updatedOwnerQuoteBalance = await provider.connection.getTokenAccountBalance(accounts.quoteOwnerTokenAccount);
//     const expectedOwnerBalance = new anchor.BN(INITIAL_TOKEN_AMOUNT).sub(depositAmount);
//     assert.equal(updatedOwnerQuoteBalance.value.amount, expectedOwnerBalance.toString(), "Owner's quote balance should have decreased by the deposit amount");

//     const userSharesAccount = await program.account.userShares.fetch(accounts.userShares);
//     // Verify that the user has received shares for their deposit
//     assert.ok(userSharesAccount.shares.gt(new anchor.BN(0)), "User's shares balance should have increased after deposit");
//     // Verify that the user's shares match the total shares in the market
//     assert.equal(userSharesAccount.shares.toString(), updatedMarketAccount.totalShares.toString(), "User's shares should match the total shares in the market");
//   });

//   it("withdraws", async () => {
//     const accounts = await setupMarket();
//     await createMarket(accounts);

//     const depositAmount = new anchor.BN(100 * LAMPORTS_PER_SOL);
//     const shares = new anchor.BN(0);
//     await deposit(accounts, depositAmount, shares);
//     const userSharesPreWithdraw = await program.account.userShares.fetch(accounts.userShares);

//     const withdrawAmount = new anchor.BN(50 * LAMPORTS_PER_SOL);
//     await withdraw(accounts, withdrawAmount, shares);

//     // Verify that the total quote in the market has decreased by the withdrawn amount
//     const updatedMarketAccount = await program.account.market.fetch(accounts.market);
//     const expectedTotalQuote = depositAmount.sub(withdrawAmount);
//     assert.equal(updatedMarketAccount.totalQuote.toString(), expectedTotalQuote.toString(), "Market quote amount should be equal to the deposited amount minus withdrawn amount");

//     // Verify that the vault's balance has decreased by the withdrawn amount
//     const updatedVaultQuoteBalance = await provider.connection.getTokenAccountBalance(accounts.quoteAta);
//     assert.equal(updatedVaultQuoteBalance.value.amount, expectedTotalQuote.toString(), "Vault quote balance should have decreased by the withdrawn amount");

//     // Verify that the owner's balance has increased by the withdrawn amount
//     const updatedOwnerQuoteBalance = await provider.connection.getTokenAccountBalance(accounts.quoteOwnerTokenAccount);
//     const expectedOwnerBalance = new anchor.BN(INITIAL_TOKEN_AMOUNT).sub(depositAmount).add(withdrawAmount);
//     assert.equal(updatedOwnerQuoteBalance.value.amount, expectedOwnerBalance.toString(), "Owner's quote balance should have increased by the withdrawn amount");

//     const userSharesPostWithdraw = await program.account.userShares.fetch(accounts.userShares);
//     // Verify that the user's shares have decreased after withdrawal
//     assert.ok(userSharesPostWithdraw.shares.lt(userSharesPreWithdraw.shares), "User's shares balance should have decreased after withdrawal");
//     // Verify that the user's shares match the total shares in the market
//     assert.equal(userSharesPostWithdraw.shares.toString(), updatedMarketAccount.totalShares.toString(), "User's shares should match the total shares in the market");
//   });

//   it("deposits collateral", async () => {
//     const accounts = await setupMarket();
//     await createMarket(accounts);

//     // Add collateral to the market
//     const oracleAddress = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // Example oracle address
//     const collateralCap = new anchor.BN(1000 * LAMPORTS_PER_SOL);
//     const rateFactor = new anchor.BN(10000); // 1.0 in fixed-point notation with 4 decimal places

//     await addCollateral(accounts, oracleAddress, collateralCap, rateFactor);

//     // Verify that the collateral has been added successfully
//     const collateralAccount = await program.account.collateral.fetch(accounts.collateralCustom);
//     assert.ok(collateralAccount, "Collateral account should exist");
//     assert.equal(collateralAccount.mint.toBase58(), accounts.collateralMint.toBase58(), "Collateral mint should match the provided collateral mint");
//     assert.equal(collateralAccount.cap.toString(), collateralCap.toString(), "Collateral cap should match the provided cap");
//     assert.equal(collateralAccount.rateFactor.toString(), rateFactor.toString(), "Collateral rate factor should match the provided rate factor");

//     const collateralDepositAmount = new anchor.BN(50 * LAMPORTS_PER_SOL);
//     await depositCollateral(accounts, collateralDepositAmount);
 
//     // Verify that the vault's collateral balance has increased by the deposited amount
//     const updatedVaultCollateralBalance = await provider.connection.getTokenAccountBalance(accounts.collateralAta);
//     assert.equal(updatedVaultCollateralBalance.value.amount, collateralDepositAmount.toString(), "Vault collateral balance should have increased by the deposited amount");

//     // Verify that the owner's collateral balance has decreased by the deposited amount
//     const updatedOwnerCollateralBalance = await provider.connection.getTokenAccountBalance(accounts.collateralOwnerTokenAccount);
//     const expectedOwnerBalance = new anchor.BN(INITIAL_TOKEN_AMOUNT).sub(collateralDepositAmount);
//     assert.equal(updatedOwnerCollateralBalance.value.amount, expectedOwnerBalance.toString(), "Owner's collateral balance should have decreased by the deposited amount");

//     const userSharesAccount = await program.account.userShares.fetch(accounts.userShares);
//     // Verify that the user's collateral has increased after deposit
//     assert.equal(userSharesAccount.collateralAmount.toString(), collateralDepositAmount.toString(), "User's collateral balance should have increased after deposit");

//     // Verify that the collateral has been added successfully
//     const updatedCollateralAccount = await program.account.collateral.fetch(accounts.collateralCustom);
//     assert.equal(updatedCollateralAccount.mint.toBase58(), accounts.collateralMint.toBase58(), "Collateral mint should match the provided collateral mint");
//     assert.equal(updatedCollateralAccount.totalCollateral.toString(), collateralDepositAmount.toString(), "Collateral total amount should match the deposited amount");
//     assert.equal(updatedCollateralAccount.totalBorrowShares.toString(), "0", "Total borrow shares should be zero initially");
//     assert.equal(updatedCollateralAccount.totalBorrowAssets.toString(), "0", "Total borrow assets should be zero initially");

//   });

//   it("borrows from the market", async () => {
//     const accounts = await setupMarket();
//     await createMarket(accounts);

//     // Deposit quote tokens to the market
//     const depositAmount = new anchor.BN(100 * LAMPORTS_PER_SOL);
//     await deposit(accounts, depositAmount, new anchor.BN(0));

//     // post deposit vault bal
//     const updatedVaultQuoteBalance = await provider.connection.getTokenAccountBalance(accounts.quoteAta);
//     const updatedOwnerQuoteBalance = await provider.connection.getTokenAccountBalance(accounts.quoteOwnerTokenAccount);

//     // Add collateral to the market
//     const oracleAddress = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // Example oracle address
//     const collateralCap = new anchor.BN(1000 * LAMPORTS_PER_SOL);
//     const rateFactor = new anchor.BN(10000); // 1.0 in fixed-point notation with 4 decimal places

//     await addCollateral(accounts, oracleAddress, collateralCap, rateFactor);

//     // Deposit collateral first
//     const collateralDepositAmount = new anchor.BN(50 * LAMPORTS_PER_SOL);
//     await depositCollateral(accounts, collateralDepositAmount);

//     // Borrow from the market
//     const borrowAmount = new anchor.BN(25 * LAMPORTS_PER_SOL);
//     const shares = new anchor.BN(0);
//     await borrow(accounts, borrowAmount, shares);

//     // Verify that the vault's quote balance has decreased by the borrowed amount
//     const postBorrowVaultQuoteBalance = await provider.connection.getTokenAccountBalance(accounts.quoteAta);
//     const expectedVaultBalance = new anchor.BN(updatedVaultQuoteBalance.value.amount).sub(borrowAmount);
//     assert.equal(postBorrowVaultQuoteBalance.value.amount, expectedVaultBalance.toString(), "Vault quote balance should have decreased by the borrowed amount");

//     // Verify that the user's quote balance has increased by the borrowed amount
//     const updatedUserQuoteBalance = await provider.connection.getTokenAccountBalance(accounts.quoteOwnerTokenAccount);
//     const expectedUserBalance = new anchor.BN(updatedOwnerQuoteBalance.value.amount).add(borrowAmount);
//     assert.equal(updatedUserQuoteBalance.value.amount, expectedUserBalance.toString(), "User's quote balance should have increased by the borrowed amount");

//     const postBorrowUserShares = await program.account.userShares.fetch(accounts.userShares);
//     // Verify that the user's borrow shares have increased after borrowing
//     assert.ok(postBorrowUserShares.borrowShares.gt(new anchor.BN(0)), "User's borrow shares should have increased after borrowing");

//     // Verify that the collateral account has been updated correctly
//     const updatedCollateralAccount = await program.account.collateral.fetch(accounts.collateralCustom);
//     assert.equal(updatedCollateralAccount.totalBorrowAssets.toString(), borrowAmount.toString(), "Total borrow assets should match the borrowed amount");
//     assert.ok(updatedCollateralAccount.totalBorrowShares.gt(new anchor.BN(0)), "Total borrow shares should be greater than zero after borrowing");
//   });



// });