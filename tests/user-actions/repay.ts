import { setupTest, TestUtils } from "../utils";
import { MarketFixture, UserFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";

describe("Repay", () => {
  let test: TestUtils;
  let market: MarketFixture;
  let larry: UserFixture;
  let bob: UserFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
      quoteDecimals: 5,
      collateralDecimals: 9,
    });

    larry = await test.createUser( 
      new anchor.BN(1100 * 1e9),
      new anchor.BN(0)
    );

    bob = await test.createUser( 
      new anchor.BN(100 * 1e9),
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

    // Bob deposits 100 collateral tokens
    await market.depositCollateral({
      user: bob,
      owner: bob,
      amount: new anchor.BN(100 * 1e9)
    });

    // Bob borrows 50 quote tokens against his collateral
    await market.borrow({
      user: bob,
      owner: bob,
      recipient: bob,
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });
  });

  it("repays all debt", async () => {
    // Get initial balances and state
    const initialQuoteBalance = await bob.get_quo_balance();
    const initialMarketData = await market.marketAcc.get_data();
    const initialBorrows = await market.marketAcc.getTotalBorrows();

    const initialBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Repay the full 50 tokens that were borrowed
    await market.repay({
      user: bob,
      owner: bob,
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });

    // Get final state
    const finalQuoteBalance = await bob.get_quo_balance();
    const finalMarketData = await market.marketAcc.get_data();
    const finalBorrows = await market.marketAcc.getTotalBorrows();
    const finalBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Verify quote token balance decreased by repayment amount
    assert.equal(
      initialQuoteBalance - finalQuoteBalance,
      BigInt(50 * 1e9),
      "Quote balance should decrease by 50 tokens"
    );

    // Verify market total borrow assets decreased
    assert.ok(
      finalBorrows.eq(
        initialBorrows.sub(new anchor.BN(50 * 1e9))
      ),
      "Market total borrow assets should decrease by 50"
    );

    // Verify market total borrow shares decreased
    assert.ok(
      finalMarketData.totalBorrowShares.eq(new anchor.BN(0)),
      "Market total borrow shares should decrease by user's shares"
    );

    // Verify user has no remaining borrow shares
    assert.ok(
      finalBorrowerShares.borrowShares.eq(new anchor.BN(0)),
      "User should have no remaining borrow shares"
    );

    // Verify bob's final quote balance is correct
    assert.equal(
      finalQuoteBalance,
      BigInt(100 * 1e9), // Started with 0, borrowed 50, repaid 50
      "Bob's final quote balance should be 950 tokens"
    );
  });

  it("repays all debt with interest", async () => {
    // Get initial balances and state
    const initialQuoteBalance = await bob.get_quo_balance();
    const initialMarketData = await market.marketAcc.get_data();
    const initialBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Instead of converting to number, compare BNs directly -> 0.05 * 1e18
    assert.equal(initialBorrowerShares.borrowShares.toNumber(), 50 * 1e9);

    // Move time forward one day
    await test.moveTimeForward(1 * 24 * 60 * 60);

    // See impact of interest accrual
    await market.accrueInterest();

    // Repay the full 50 tokens that were borrowed
    await market.repay({
      user: bob,
      owner: bob,
      amount: new anchor.BN(0),
      shares: new anchor.BN(50 * 1e9)
    });

    // Get final state
    const finalQuoteBalance = await bob.get_quo_balance();
    const finalMarketData = await market.marketAcc.get_data();
    const finalBorrows = await market.marketAcc.getTotalBorrows();
    const finalDeposits = await market.marketAcc.getTotalDeposits();
    const finalBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Verify quote token balance decreased by repayment amount
    assert.equal(
      initialQuoteBalance - finalQuoteBalance,
      new anchor.BN(50.001598199 * 1e9),
      "Quote balance should decrease by 50 tokens"
    );

    // Verify market total borrow assets is zero
    assert.equal(finalBorrows.toNumber(), new anchor.BN(0));
    
    // Verify market total deposits has increased
    assert.equal(finalDeposits.toNumber(), new anchor.BN(1000.031963981 * 1e9));

    // Verify market total borrow shares decreased
    assert.ok(
      finalMarketData.totalBorrowShares.eq(new anchor.BN(0)),
      "Market total borrow shares should decrease by user's shares"
    );

    // Verify user has no remaining borrow shares
    assert.ok(
      finalBorrowerShares.borrowShares.eq(new anchor.BN(0)),
      "User should have no remaining borrow shares"
    );

    // Verify bob's final quote balance is correct
    assert.equal(
      finalQuoteBalance,
      BigInt(99.998401801 * 1e9 ), // Started with 0, borrowed 50, repaid 50
      "Bob's final quote balance should be 950 tokens"
    );
  });

  it("repays partial debt", async () => {

    // Setup initial state
    await market.borrow({
      user: bob,
      owner: bob,
      recipient: bob,
      amount: new anchor.BN(50 * 1e9), // Borrow additional 50 tokens
      shares: new anchor.BN(0)
    });

    const initialQuoteBalance = await bob.get_quo_balance();
    const initialMarketData = await market.marketAcc.get_data();
    const initialBorrows = await market.marketAcc.getTotalBorrows();
    const initialBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Repay half of the borrowed amount
    await market.repay({
      user: bob,
      owner: bob,
      amount: new anchor.BN(25 * 1e9), // Repay 25 tokens
      shares: new anchor.BN(0)
    });

    // Get final state
    const finalQuoteBalance = await bob.get_quo_balance();
    const finalMarketData = await market.marketAcc.get_data();
    const finalBorrows = await market.marketAcc.getTotalBorrows();
    const finalDeposits = await market.marketAcc.getTotalDeposits();
    const finalBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Verify quote token balance decreased by repayment amount
    assert.equal(
      initialQuoteBalance - finalQuoteBalance,
      BigInt(25 * 1e9),
      "Quote balance should decrease by 25 tokens"
    );

    // Verify market total borrow assets decreased by repayment amount
    assert.equal(
      finalBorrows.toNumber(),
      initialBorrows.sub(new anchor.BN(25 * 1e9)).toNumber()
    );

    // Verify bob's final quote balance is correct
    assert.equal(
      finalQuoteBalance,
      new anchor.BN(175 * 1e9), // Started with 50, borrowed 50, repaid 25
      "Bob's final quote balance should be 25 tokens"
    );
  });

  it("fails to repay when no debt", async () => {

    // Repay all debt
    await market.repay({
      user: bob,
      owner: bob,
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });

    const borrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(
      borrowerShares.borrowShares.toNumber(),
      0,
      "Bob's borrow shares should be 0 after full repayment"
    );

    // Try to repay debt
    await assert.rejects(
      async () => {
        await market.repay({
          user: bob,
          owner: bob,
          amount: new anchor.BN(0),
          shares: new anchor.BN(100 * 1e9)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Math Underflow");
        return true;
      }
    );
  });

  it("repays all debt with a delegate", async () => {
    // Get initial balances and state
    const priorBobQuoteBalance = await bob.get_quo_balance();
    const priorLarryQuoteBalance = await larry.get_quo_balance();
    const initialMarketData = await market.marketAcc.get_data();
    const initialBorrows = await market.marketAcc.getTotalBorrows();

    assert.equal(priorBobQuoteBalance, BigInt(150 * 1e9));
    assert.equal(priorLarryQuoteBalance, BigInt(100 * 1e9));

    const priorBobBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Repay the full 50 tokens that were borrowed
    await market.repay({
      user: larry,
      owner: bob,
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });

    // Get final state
    const finalBobQuoteBalance = await bob.get_quo_balance();
    const finalLarryQuoteBalance = await larry.get_quo_balance();
    const finalMarketData = await market.marketAcc.get_data();
    const finalBorrows = await market.marketAcc.getTotalBorrows();
    const finalBobBorrowerShares = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    const finalLarryBorrowerShares = await market
      .get_borrower_shares(larry.key.publicKey)
      .get_data();

    // Verify quote token balance decreased by repayment amount
    assert.equal(
      priorBobQuoteBalance - finalBobQuoteBalance,
      BigInt(0),
      "Quote balance should not change"
    );

    assert.equal(
      priorLarryQuoteBalance - finalLarryQuoteBalance,
      BigInt(50 * 1e9),
      "Larry's quote balance should decrease by 50 tokens"
    );

    // Verify market total borrow assets decreased
    assert.ok(
      finalBorrows.eq(
        initialBorrows.sub(new anchor.BN(50 * 1e9))
      ),
      "Market total borrow assets should decrease by 50"
    );

    // Verify market total borrow shares decreased
    assert.ok(
      finalMarketData.totalBorrowShares.eq(new anchor.BN(0)),
      "Market total borrow shares should decrease by user's shares"
    );

    // Verify user has no remaining borrow shares
    assert.ok(
      finalBobBorrowerShares.borrowShares.eq(new anchor.BN(0)),
      "Bob should have no remaining borrow shares"
    );

    // Verify bob's final quote balance is correct
    assert.equal(
      finalBobQuoteBalance,
      BigInt(150 * 1e9), // Started with 100, borrowed 50
      "Bob's final quote balance should be 150 tokens"
    );

    // Verify larry's final quote balance is correct
    assert.equal(
      finalLarryQuoteBalance,
      BigInt(50 * 1e9), // Started with 100, repaid 50
      "Larry's final quote balance should be 50 tokens"
    );
  });
  
});
