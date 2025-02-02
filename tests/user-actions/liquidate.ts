import { TestUtils } from "../utils";
import { MarketFixture, UserFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";

describe("Liquidate", () => {
  let test: TestUtils;
  let market: MarketFixture;
  let liquidator: UserFixture;  // User performing the liquidation
  let borrower: UserFixture;    // User being liquidated
  let lender: UserFixture;      // User providing liquidity

  beforeEach(async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
      collateralDecimals: 9,
    });

    // Setup lender with quote tokens to provide liquidity
    lender = await test.createUser(
      new anchor.BN(1000 * 1e9), // 1000 quote tokens
      new anchor.BN(0)
    );

    // Setup borrower with collateral
    borrower = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(1000 * 1e9) // 1000 collateral tokens
    );

    // Setup liquidator with quote tokens to repay debt
    liquidator = await test.createUser(
      new anchor.BN(1000 * 1e9), // 1000 quote tokens
      new anchor.BN(0)
    );

    let futarchy = await test.createUser( 
      new anchor.BN(0),
      new anchor.BN(0)
    );

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(8 * 1e8), // 80% LTV
      price: new anchor.BN(1e5), // $1.00
      conf: new anchor.BN(1 * 10 ** 4), // $0.01 confidence interval
      expo: -5,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    await market.create({ user: lender });

    // Lender deposits quote tokens
    await market.deposit({
      user: lender,
      amount: new anchor.BN(1000 * 1e9), // 1000 quote tokens
      shares: new anchor.BN(0),
      owner: lender,
    });

    // Borrower deposits collateral
    await market.depositCollateral({
      user: borrower,
      amount: new anchor.BN(100 * 1e9), // 100 collateral tokens
      owner: borrower
    });

    // Borrower takes out a loan
    await market.borrow({
      user: borrower,
      amount: new anchor.BN(70 * 1e9),
      shares: new anchor.BN(0),
      owner: borrower,
      recipient: borrower,
    });
  });

  it("liquidates an underwater position", async () => {
    // Update price to make position underwater (50% price drop)
    await market.collateral.setPrice({
      price: new anchor.BN(5 * 1e4),  // $0.50
      conf: new anchor.BN(1 * 10 ** 4),
    });

    const initialBorrowerShares = await market
      .get_borrower_shares(borrower.key.publicKey)
      .get_data();
    const initialLiquidatorQuote = await liquidator.get_quo_balance();
    const initialLiquidatorCollateral = await liquidator.get_col_balance();

    // Perform liquidation
    await market.liquidate({
      user: liquidator,
      borrower: borrower.key.publicKey,
      collateralAmount: new anchor.BN(2 * 1e9),
      repayShares: new anchor.BN(0)
    });

    const finalLiquidatorQuote = await liquidator.get_quo_balance();
    const finalLiquidatorCollateral = await liquidator.get_col_balance();

    // Verify liquidator's balance changes
    assert.equal(
      initialLiquidatorQuote - finalLiquidatorQuote,
      BigInt(1_043_478_261),  // Spent quote tokens
      "Incorrect quote token change"
    );

    assert.equal(
      finalLiquidatorCollateral - initialLiquidatorCollateral,
      BigInt(2_000_000_000),
      "Incorrect collateral received"
    );

    // Verify borrower's position was updated
    const borrowerShares = await market
      .get_borrower_shares(borrower.key.publicKey)
      .get_data();

    assert.ok(
      borrowerShares.borrowShares < initialBorrowerShares.borrowShares,
      "Borrow position should be reduced"
    );
  });

  it("fails if borrower is solvent", async () => {
    await assert.rejects(
      async () => {
        await market.liquidate({
          user: liquidator,
          borrower: borrower.key.publicKey,
          collateralAmount: new anchor.BN(2 * 1e9),
          repayShares: new anchor.BN(0)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Borrower is solvent");
        return true;
      }
    );
  });

  it("fails if liquidator lacks sufficient quote tokens", async () => {
    // Update price to make position underwater (50% price drop)
    await market.collateral.setPrice({
      price: new anchor.BN(5 * 1e4),  // $0.50
      conf: new anchor.BN(1 * 10 ** 4),
    });

    // Create liquidator with insufficient funds
    let poorLiquidator = await test.createUser(
      new anchor.BN(1 * 1e9),  // Only 1 quote token
      new anchor.BN(0)
    );

    await assert.rejects(
      async () => {
        await market.liquidate({
          user: poorLiquidator,
          borrower: borrower.key.publicKey,
          collateralAmount: new anchor.BN(3 * 1e9),
          repayShares: new anchor.BN(0)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Insufficient balance");
        return true;
      }
    );
  });
});

