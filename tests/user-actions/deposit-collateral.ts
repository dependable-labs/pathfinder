import { TestUtils } from "../utils";
import { MarketFixture, UserFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";

describe("Deposit Collateral", () => {
  let test: TestUtils;
  let accounts: any;

  let market: MarketFixture;
  let larry: UserFixture;
  let bob: UserFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
        quoteDecimals: 9,
        collateralDecimals: 9,
    });
  
    larry = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );
  
    bob = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(1_000 * 1e9),
    );
  
    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(10 * 1e9), // upperbound: 110 * 1e9, lowerbound: 90 * 1e9
      expo: -9,
    });  

    await market.create({user: larry});

  });

  it("should deposit collateral", async () => {

    const initialCollateralBalance = await bob.get_col_balance();

    // Get initial protocol state
    const initialBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(initialBorrowerShares, undefined);

    await market.depositCollateral({
      user: bob,
      amount: new anchor.BN(1 * 1e9),
      owner: bob,
    });

    // Get final protocol state
    const finalBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(
      finalBorrowerShares.collateralAmount.toNumber(),
      BigInt(1 * 1e9),
      "Borrower shares should increase by 1 token"
    );

    const finalCollateralBalance = await bob.get_col_balance();
    assert.equal(
      initialCollateralBalance - finalCollateralBalance,
      BigInt(1 * 1e9),
      "Collateral balance should decrease by 1 token"
    );
  });

  it("should deposit collateral", async () => {

    const initialCollateralBalance = await bob.get_col_balance();

    // Get initial protocol state
    const initialBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(initialBorrowerShares, undefined);

    await market.depositCollateral({
      user: bob,
      amount: new anchor.BN(1 * 1e9),
      owner: bob,
    });

    // Get final protocol state
    const finalBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(
      finalBorrowerShares.collateralAmount.toNumber(),
      BigInt(1 * 1e9),
      "Collateral amount should increase by 1 token"
    );

    const finalCollateralBalance = await bob.get_col_balance();
    assert.equal(
      initialCollateralBalance - finalCollateralBalance,
      BigInt(1 * 1e9),
      "Collateral balance should decrease by 1 token"
    );
  });

  it("delegate should deposit collateral on behalf of owner", async () => {

    let barry = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(1_000 * 1e9),
    );

    const initialCollateralBalance = await bob.get_col_balance();

    // Get initial protocol state
    const initialBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(initialBorrowerShares, undefined);

    await market.depositCollateral({
      user: barry,
      amount: new anchor.BN(1 * 1e9),
      owner: bob,
    });

    // Get final protocol state
    const finalBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(
      finalBorrowerShares.collateralAmount.toNumber(),
      BigInt(1 * 1e9),
      "Collateral amount should increase by 1 token"
    );

    const finalCollateralBalance = await bob.get_col_balance();
    assert.equal(
      initialCollateralBalance - finalCollateralBalance,
      BigInt(0),
      "Collateral balance should decrease by 1 token"
    );

    const finalBarryCollateralBalance = await barry.get_col_balance();
    assert.equal(
      finalBarryCollateralBalance,
      BigInt(999 * 1e9),
      "Barry should have 0 collateral balance"
    );
  });
});