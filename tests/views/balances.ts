import { MarketFixture, UserFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";
import { TestUtils } from "../utils";

describe("View Balances", () => {
  let test: TestUtils;
  let market: MarketFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
      collateralDecimals: 9,
    });
  });

  it("expectedMarketBalances should return the correct values", async () => {
    market = await _generatePendingInterest({
      test: test,
      amountSupplied: new anchor.BN(100 * 1e9),
      amountBorrowed: new anchor.BN(50 * 1e9),
      timeElapsed: 30 * 24 * 60 * 60, // 30 days in seconds
      fee: new anchor.BN("10000000000000000"),
    });

    const [virtualTotalDeposits, virtualTotalShares, virtualTotalBorrows, virtualTotalBorrowShares] = await market.viewMarketBalances();

    await market.accrueInterest();

    const marketAccountData = await market.marketAcc.get_data();
    let deposits = await market.marketAcc.getTotalDeposits();
    let borrows = await market.marketAcc.getTotalBorrows();

    assert.equal(virtualTotalDeposits.toString(), deposits.toString(), "total supply assets");
    assert.equal(virtualTotalBorrows.toString(), borrows.toString(), "total borrow assets");
    assert.equal(virtualTotalShares.toString(), marketAccountData.totalShares.toString(), "total supply shares");
    assert.equal(virtualTotalBorrowShares.toString(), marketAccountData.totalBorrowShares.toString(), "total borrow shares");
  });

  it("expectedTotalSupplyAssets should return the correct value", async () => {
    market = await _generatePendingInterest({
      test: test,
      amountSupplied: new anchor.BN(100 * 1e9),
      amountBorrowed: new anchor.BN(50 * 1e9),
      timeElapsed: 30 * 24 * 60 * 60,
      fee: new anchor.BN("10000000000000000"),
    });

    const expectedTotalSupplyAssets = await market.viewTotalSupplyAssets();

    await market.accrueInterest();

    const deposits = await market.marketAcc.getTotalDeposits();
    assert.equal(expectedTotalSupplyAssets.toString(), deposits.toString());
  });

  it("expectedTotalBorrowAssets should return the correct value", async () => {
    market = await _generatePendingInterest({
      test: test,
      amountSupplied: new anchor.BN(100 * 1e9),
      amountBorrowed: new anchor.BN(50 * 1e9),
      timeElapsed: 30 * 24 * 60 * 60,
      fee: new anchor.BN("10000000000000000"),
    });

    const expectedTotalBorrowAssets = await market.viewTotalBorrowAssets();

    await market.accrueInterest();

    const borrows = await market.marketAcc.getTotalBorrows();
    assert.equal(expectedTotalBorrowAssets.toString(), borrows.toString());
  });

  it("expectedTotalSupplyShares should return the correct value", async () => {
    market = await _generatePendingInterest({
      test: test,
      amountSupplied: new anchor.BN(100 * 1e9),
      amountBorrowed: new anchor.BN(50 * 1e9),
      timeElapsed: 30 * 24 * 60 * 60,
      fee: new anchor.BN("10000000000000000"),
    });

    const expectedTotalShares = await market.viewTotalShares();

    await market.accrueInterest();

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(expectedTotalShares.toString(), marketAccountData.totalShares.toString());
  });
});

async function _generatePendingInterest({
  test,
  amountSupplied,
  amountBorrowed,
  timeElapsed,
  fee,
}: {
  test: TestUtils;
  amountSupplied: anchor.BN;
  amountBorrowed: anchor.BN;
  timeElapsed: number;
  fee: anchor.BN;
}) {
  let futarchy = await test.createUser(
    new anchor.BN(0),
    new anchor.BN(0)
  );

  const larry = await test.createUser(
    new anchor.BN(1_000 * 1e9),
    new anchor.BN(0)
  );

  let market = await test.createMarket({
    symbol: "BONK",
    ltvFactor: new anchor.BN(0.8 * 1e9),
    price: new anchor.BN(100 * 1e9),
    conf: new anchor.BN(0),
    expo: -9,
    feeRecipient: futarchy,
    authority: futarchy,
  });

  await market.createAndSetAuthority({ user: larry });

  await market.updateFee({
    user: futarchy,
    feeFactor: fee,
  });

  await market.deposit({
    user: larry,
    amount: amountSupplied,
    shares: new anchor.BN(0),
    owner: larry,
  });

  const bob = await test.createUser(
    new anchor.BN(0),
    new anchor.BN(1_000 * 1e9)
  );

  const collateralAmount = amountBorrowed
    .mul(new anchor.BN(1e9)) // price scale
    .div(market.collateral.ltvFactor)
    .mul(new anchor.BN(1e9)) // price scale
    .div(new anchor.BN(100 * 1e9)); // price

  await market.depositCollateral({
    user: bob,
    amount: collateralAmount,
    owner: bob,
  });

  await market.borrow({
    user: bob,
    amount: amountBorrowed,
    shares: new anchor.BN(0),
    owner: bob,
    recipient: bob,
  });

  // move time forward
  await test.moveTimeForward(timeElapsed);

  return market;
}