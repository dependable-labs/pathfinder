import { TestUtils } from "../../utils";
import { MarketFixture, UserFixture } from "../../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("Accrue Interest", () => {
  let test: TestUtils;
  let market: MarketFixture;
  let larry: UserFixture; // Lender
  let bob: UserFixture;   // Borrower
  let futarchy: UserFixture; // protocol fee recipient

  beforeEach(async () => {

    test = await TestUtils.create({
      quoteDecimals: 9,
      collateralDecimals: 9,
    });

    larry = await test.createUser(
      new anchor.BN(1_000_000 * 1e9),
      new anchor.BN(0)
    );

    bob = await test.createUser(
      new anchor.BN(1_000_000 * 1e9),
      new anchor.BN(1_000_000 * 1e9)
    );

    futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    await market.createAndSetAuthority({ user: larry });

    // Setup initial state: deposit, collateralize, and borrow
    await market.deposit({
      user: larry,
      amount: new anchor.BN(1_000 * LAMPORTS_PER_SOL),
      shares: new anchor.BN(0),
      owner: larry,
    });

    await market.depositCollateral({
      user: bob,
      amount: new anchor.BN(100 * LAMPORTS_PER_SOL),
      owner: bob,
    });

    await market.borrow({
      user: bob,
      amount: new anchor.BN(500 * LAMPORTS_PER_SOL),
      shares: new anchor.BN(0),
      owner: bob,
      recipient: bob,
    });
  });

  it("correctly for year", async () => {
    const beforeTotalBorrows = await market.marketAcc.getTotalBorrows();
    const beforeTotalDeposits = await market.marketAcc.getTotalDeposits();

    // Advance clock by 1 year
    await test.moveTimeForward(365 * 24 * 3600);

    await market.accrueInterest();

    const afterTotalBorrows = await market.marketAcc.getTotalBorrows();
    const afterTotalDeposits = await market.marketAcc.getTotalDeposits();

    // Convert to BN and calculate difference
    const borrowDifference = afterTotalBorrows.sub(beforeTotalBorrows);
    const depositDifference = afterTotalDeposits.sub(beforeTotalDeposits);

    // Verify interest accrual
    assert.equal(
      borrowDifference.toNumber(),
      13_512_691_343 // Expected interest accrual
    );

    assert.equal(
      depositDifference.toNumber(),
      27_025_382_686 // Expected interest accrual
    );
  });

  it("correctly for a year with protocol fee", async () => {
    const beforeTotalBorrows = await market.marketAcc.getTotalBorrows();
    const beforeTotalDeposits = await market.marketAcc.getTotalDeposits();

    // Set protocol fee to 1%
    await market.updateFee({
      user: futarchy,
      feeFactor: new anchor.BN("10000000000000000")
    });

    // Advance clock by 1 year
    await test.moveTimeForward(365 * 24 * 3600);

    await market.accrueInterest();

    const afterTotalBorrows = await market.marketAcc.getTotalBorrows();
    const afterTotalDeposits = await market.marketAcc.getTotalDeposits();

    // Convert to BN and calculate difference
    const borrowDifference = afterTotalBorrows.sub(beforeTotalBorrows);
    const depositDifference = afterTotalDeposits.sub(beforeTotalDeposits);

    // Verify interest accrual
    assert.equal(
      borrowDifference.toNumber(),
      13_512_691_343 // Expected interest accrual
    );

    // Verify fee accrual
    assert.equal(
      depositDifference.toNumber(),
      27_160_527_380 // Same total interest
    );
  });

  it("correctly for year 80% utilization", async () => {

    await market.borrow({
      user: bob,
      amount: new anchor.BN(300 * LAMPORTS_PER_SOL),
      shares: new anchor.BN(0),
      owner: bob,
      recipient: bob,
    });

    // 800 Debt, 1000 Capacity -> 80% utilization
    const beforeTotalBorrows = await market.marketAcc.getTotalBorrows();

    // Advance clock by 1 year
    await test.moveTimeForward(365 * 24 * 3600);

    await market.accrueInterest();

    const afterTotalBorrows = await market.marketAcc.getTotalBorrows();

    assert.equal(beforeTotalBorrows.toNumber(), 800_000_000_000);
    assert.equal(afterTotalBorrows.toNumber(), 829_877_683_931);

    // Convert to BN and calculate difference
    const difference = afterTotalBorrows.sub(beforeTotalBorrows);

    assert.equal(
      difference.toNumber(),
      29_877_683_931 // Expected interest accrual
    );
  });

  it("for multiple periods", async () => {
    const beforeTotalBorrows = await market.marketAcc.getTotalBorrows();

    // Advance clock by 2 years  
    await test.moveTimeForward(365 * 24 * 2 * 3600);

    await market.accrueInterest();

    const afterTotalBorrows = await market.marketAcc.getTotalBorrows();

    // Convert to BN and calculate difference
    const difference = afterTotalBorrows.sub(beforeTotalBorrows);

    assert.equal(
      difference.toNumber(),
      27_390_419_723
    );
  });

  it("updates last accrual timestamp", async () => {
    const beforeTotalBorrows = await market.marketAcc.getTotalBorrows();

    await test.moveTimeForward(365 * 24 * 3600);

    await market.accrueInterest();

    const afterTotalBorrows = await market.marketAcc.getTotalBorrows();

    assert.notEqual(
      afterTotalBorrows.toNumber(),
      beforeTotalBorrows.toNumber()
    );
  });

  it("correctly for year with six decimal quote token", async () => {

    test = await TestUtils.create({
      quoteDecimals: 6,
      collateralDecimals: 9,
    });

    let lip = await test.createUser(
      new anchor.BN(1_000 * 1e6),
      new anchor.BN(0)
    );

    let barry = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(1_000 * 1e9)
    );

    let futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e6),
      price: new anchor.BN(100 * 1e6),
      conf: new anchor.BN(10 * 1e6),
      expo: -6,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    await market.createAndSetAuthority({ user: lip });

    // Setup initial state: deposit, collateralize, and borrow
    await market.deposit({
      user: lip,
      amount: new anchor.BN(1_000 * 1e6),
      shares: new anchor.BN(0),
      owner: lip,
    });

    await market.depositCollateral({
      user: barry,
      amount: new anchor.BN(100 * 1e9),
      owner: barry,
    });

    await market.borrow({
      user: barry,
      amount: new anchor.BN(500 * 1e6),
      shares: new anchor.BN(0),
      owner: barry,
      recipient: barry,
    });

    const beforeTotalBorrows = await market.marketAcc.getTotalBorrows();

    // Advance clock by 1 year
    await test.moveTimeForward(365 * 24 * 3600);

    await market.accrueInterest();

    const afterTotalBorrows = await market.marketAcc.getTotalBorrows();

    // Convert to BN and calculate difference
    const difference = afterTotalBorrows.sub(beforeTotalBorrows);

    // Verify interest accrual (5% on 500 * 1e6 = 25 * 1e6)
    assert.equal(
      difference.toNumber(),
      13.512_691 * 1e6 // Expected interest accrual
    );
  });


  it("correctly for year with nine decimal collateral token", async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
      collateralDecimals: 9,
    });

    let lip = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    let barry = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(1_000 * 1e9)
    );

    let futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    await market.createAndSetAuthority({ user: lip });

    // Setup initial state: deposit, collateralize, and borrow
    await market.deposit({
      user: lip,
      amount: new anchor.BN(1_000 * 1e9),
      shares: new anchor.BN(0),
      owner: lip,
    });

    await market.depositCollateral({
      user: barry,
      amount: new anchor.BN(100 * 1e9),
      owner: barry,
    });

    await market.borrow({
      user: barry,
      amount: new anchor.BN(500 * 1e9),
      shares: new anchor.BN(0),
      owner: barry,
      recipient: barry,
    });

    const beforeTotalBorrows = await market.marketAcc.getTotalBorrows();

    // Advance clock by 1 year
    await test.moveTimeForward(365 * 24 * 3600);

    await market.accrueInterest();

    const afterTotalBorrows = await market.marketAcc.getTotalBorrows();

    // Convert to BN and calculate difference
    const difference = afterTotalBorrows.sub(beforeTotalBorrows);

    // Verify interest accrual
    assert.equal(
      difference.toNumber(),
      13.512_691_343 * 1e9 // Expected interest accrual
    );
  });

  it("correctly for year with six decimal collateral token", async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
      collateralDecimals: 6,
    });

    let lip = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    let barry = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(1_000 * 1e6)
    );

    let futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(100 * 1e6),
      conf: new anchor.BN(10 * 1e6),
      expo: -6,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    await market.createAndSetAuthority({ user: lip });

    // Setup initial state: deposit, collateralize, and borrow
    await market.deposit({
      user: lip,
      amount: new anchor.BN(1_000 * 1e9),
      shares: new anchor.BN(0),
      owner: lip,
    });

    await market.depositCollateral({
      user: barry,
      amount: new anchor.BN(100 * 1e6),
      owner: barry,
    });

    await market.borrow({
      user: barry,
      amount: new anchor.BN(500 * 1e9),
      shares: new anchor.BN(0),
      owner: barry,
      recipient: barry,
    });

    const beforeTotalBorrows = await market.marketAcc.getTotalBorrows();

    // Advance clock by 1 year
    await test.moveTimeForward(365 * 24 * 3600);

    await market.accrueInterest();

    const afterTotalBorrows = await market.marketAcc.getTotalBorrows();

    // Convert to BN and calculate difference
    const difference = afterTotalBorrows.sub(beforeTotalBorrows);

    // Verify interest accrual (5% on 500 * 1e6 = 25 * 1e6)
    assert.equal(
      difference.toNumber(),
      13.512_691_343 * 1e9 // Expected interest accrual
    );
  });
});