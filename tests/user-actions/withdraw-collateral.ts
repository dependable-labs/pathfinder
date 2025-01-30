import { TestUtils } from "../utils";
import { MarketFixture, UserFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";

describe("Withdraw Collateral", () => {
  let test: TestUtils;
  let market: MarketFixture;
  let larry: UserFixture;
  let bob: UserFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
      collateralDecimals: 9,
    });

    larry = await test.createUser(
      new anchor.BN(1000 * 1e9),
      new anchor.BN(0)
    );

    bob = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(1000 * 1e9)
    );

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(100 * 10 ** 5),
      conf: new anchor.BN(10 * 1e5),
      expo: -5
    });

    await market.create({ user: larry });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1000 * 1e9),
      shares: new anchor.BN(0)
    });

    // Pre-deposit collateral for withdrawal tests
    await market.depositCollateral({
      user: bob,
      owner: bob,
      amount: new anchor.BN(100 * 1e9)  // 100 collateral tokens
    });
  });

  it("withdraws all collateral when no borrows", async () => {
    const initialBalance = await bob.get_col_balance();

    await market.withdrawCollateral({
      user: bob,
      owner: bob,
      recipient: bob,
      amount: new anchor.BN(100 * 1e9)  // Withdraw all 100 tokens
    });

    const collateralData = await market.marketAcc.get_data();
    assert.ok(collateralData.totalCollateral.eq(new anchor.BN(0)), "Total collateral should be zero");

    const borrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // user has no collateral after withdrawal
    assert.ok(borrowerShares.collateralAmount.eq(new anchor.BN(0)), "User should have no collateral");

    const finalBalance = await bob.get_col_balance();

    assert.equal(
      finalBalance - initialBalance,
      BigInt(100 * 1e9),
      "User should have withdrawn 100 collateral tokens"
    );
    
    assert.equal(
      finalBalance,
      BigInt(1000 * 1e9),
      "Users final balance should be 1000 collateral tokens"
    );
  });

  it("partially withdraws collateral with a small borrow position", async () => {
    // First, borrow a small amount
    await market.borrow({
      user: bob,
      amount: new anchor.BN(10 * 1e9), // Borrow 10 tokens
      shares: new anchor.BN(0),
      owner: bob,
      recipient: bob,
    });

    const initialCollateralData = await market.marketAcc.get_data();

    // Withdraw half of the collateral
    await market.withdrawCollateral({
      user: bob,
      owner: bob,
      recipient: bob,
      amount: new anchor.BN(50 * 1e9)  // Withdraw 50 tokens
    });

    const finalCollateralData = await market.marketAcc.get_data();
    assert.ok(
      finalCollateralData.totalCollateral.eq(initialCollateralData.totalCollateral.sub(new anchor.BN(50 * 1e9))),
      "Total collateral should decrease by 50 tokens"
    );

    const borrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.ok(
      borrowerShares.collateralAmount.eq(new anchor.BN(50 * 1e9)),
      "User should have 50 tokens of collateral left"
    );

    const finalBalance = await bob.get_col_balance();
    
    assert.equal(
      finalBalance,
      BigInt(950 * 1e9),
      "Users final balance should be 950 collateral tokens"
    );
  });

  it("fails to withdraw collateral when borrower is not solvent", async () => {
    // First, borrow some tokens to create a debt
    await market.borrow({
      user: bob,
      amount: new anchor.BN(50 * 1e9), // Borrow 50 tokens
      shares: new anchor.BN(0),
      owner: bob,
      recipient: bob,
    });

    // Attempt to withdraw all collateral, which would make the borrower insolvent
    await assert.rejects(
      async () => {
        await market.withdrawCollateral({
          user: bob,
          owner: bob,
          recipient: bob,
          amount: new anchor.BN(100 * 1e9) // Attempt to withdraw all 100 tokens
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6011);
        assert.strictEqual(err.error.errorMessage, 'User is not solvent');
        return true;
      },
      "Expected withdrawal to fail due to insolvency"
    );

    // Verify that collateral balance hasn't changed
    const finalCollateralBalance = await bob.get_col_balance();
    assert.equal(
      finalCollateralBalance,
      BigInt(900 * 1e9),
      "Collateral balance should remain unchanged"
    );
  });

  it("delegate should withdraw collateral on behalf of owner", async () => {
    const initialLarryBalance = await larry.get_col_balance();
    const initialBobBalance = await bob.get_col_balance();
    assert.equal(initialLarryBalance, BigInt(0), "Larry should have 0 collateral tokens");
    assert.equal(initialBobBalance, BigInt(900 * 1e9), "Bob should have 100 collateral tokens");

    await market.updateDelegate({
      user: bob,
      newDelegate: larry,
    });

    await market.withdrawCollateral({
      user: larry,
      owner: bob,
      recipient: larry,
      amount: new anchor.BN(100 * 1e9)  // Withdraw all 100 tokens
    });

    const collateralData = await market.marketAcc.get_data();
    assert.ok(collateralData.totalCollateral.eq(new anchor.BN(0)), "Total collateral should be zero");

    const borrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // user has no collateral after withdrawal
    assert.ok(borrowerShares.collateralAmount.eq(new anchor.BN(0)), "User should have no collateral");

    const finalBobBalance = await bob.get_col_balance();

    assert.equal(
      finalBobBalance - initialBobBalance,
      BigInt(0),
      "User should have withdrawn 100 collateral tokens"
    );
    
    assert.equal(
      finalBobBalance,
      BigInt(900 * 1e9),
      "Bobs balance should not have changed"
    );

    const finalLarryBalance = await larry.get_col_balance();
    assert.equal(finalLarryBalance, BigInt(100 * 1e9), "Larry should have 100 collateral tokens");
  });
});
