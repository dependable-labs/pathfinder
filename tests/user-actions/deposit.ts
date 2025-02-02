import { MarketFixture, UserFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";
import { TestUtils } from "../utils";

describe("Deposit", () => {
  let test: TestUtils;
  let market: MarketFixture;
  let larry: UserFixture;
  let lizz: UserFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
      quoteDecimals: 5,
      collateralDecimals: 9,
    });

    larry = await test.createUser(
      new anchor.BN(1_000 * 1e5),
      new anchor.BN(0)
    );

    lizz = await test.createUser(
      new anchor.BN(1_000 * 1e5),
      new anchor.BN(0)
    );

    let futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e5),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -5,
      feeRecipient: futarchy,
      authority: futarchy,
    });  

    await market.create({ user: larry });

  });

  it("into a market", async () => {
    await market.deposit({
      user: larry,
      amount: new anchor.BN(1 * 1e5),
      shares: new anchor.BN(0),
      owner: larry,
    });

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.totalShares.toNumber(), 1 * 1e5);
    assert.equal(await market.quoteAta.getTokenBalance(), 1 * 1e5);
    let deposits = await market.marketAcc.getTotalDeposits();
    assert.equal(deposits.toNumber(), 1 * 1e5);

    const lenderSharesAccountData = await market
      .get_lender_shares(larry.key.publicKey)
      .get_data();
    assert.equal(lenderSharesAccountData.shares.toNumber(), 1 * 1e5);
    assert.equal(await larry.get_quo_balance(), BigInt(999 * 1e5));
  });

  it("two users Deposit into a market", async () => {
    await market.deposit({
      user: larry,
      amount: new anchor.BN(5 * 1e5),
      shares: new anchor.BN(0),
      owner: larry,
    });

    await market.deposit({
      user: lizz,
      amount: new anchor.BN(5 * 1e5),
      shares: new anchor.BN(0),
      owner: lizz,
    });

    const marketAccountData2 = await market.marketAcc.get_data();
    assert.equal(marketAccountData2.totalShares.toNumber(), 10 * 1e5);

    let deposits = await market.marketAcc.getTotalDeposits();
    assert.equal(deposits.toNumber(), 10 * 1e5);

    const lenderSharesAccountData2 = await market
      .get_lender_shares(lizz.key.publicKey)
      .get_data();
    assert.equal(lenderSharesAccountData2.shares.toNumber(), 5 * 1e5);

    assert.equal(await larry.get_quo_balance(), BigInt(995 * 1e5));
    assert.equal(await lizz.get_quo_balance(), BigInt(995 * 1e5));
  });

  it("nine decimal quote Deposit into a market", async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
      collateralDecimals: 9,
    });

    larry = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    lizz = await test.createUser(
      new anchor.BN(1_000 * 1e5),
      new anchor.BN(0)
    );
    
    let futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e5),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -5,
      feeRecipient: futarchy,
      authority: futarchy,
    });  

    await market.create({ user: larry });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(5 * 1e9),
      shares: new anchor.BN(0),
      owner: larry,
    });

    const marketAccountData2 = await market.marketAcc.get_data();
    assert.equal(marketAccountData2.totalShares, 5 * 1e9);

    let deposits = await market.marketAcc.getTotalDeposits();
    assert.equal(deposits.toNumber(), 5 * 1e9);

    const lenderSharesAccountData2 = await market
      .get_lender_shares(larry.key.publicKey)
      .get_data()
    assert.equal(lenderSharesAccountData2.shares.toNumber(), 5 * 1e9);

    assert.equal(await larry.get_quo_balance(), BigInt(995 * 1e9));
  });

  it("On behalf of another owner", async () => {
    const priorMarketAccountData = await market.marketAcc.get_data();
    assert.equal(priorMarketAccountData.totalShares.toNumber(), 0);
    assert.equal(await market.quoteAta.getTokenBalance(), 0);
    let priorDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(priorDeposits.toNumber(), 0);

    // account not initialized
    const priorlarryData = await market
      .get_lender_shares(larry.key.publicKey)
      .get_data();
    assert.equal(priorlarryData, undefined);
    assert.equal(await larry.get_quo_balance(), BigInt(1000 * 1e5));

    // account not initialized
    const priorlizzData = await market
      .get_lender_shares(lizz.key.publicKey)
      .get_data();
    assert.equal(priorlizzData, undefined);
    assert.equal(await lizz.get_quo_balance(), BigInt(1000 * 1e5));

    await market.deposit({
      user: larry,
      owner: lizz,
      amount: new anchor.BN(1 * 1e5),
      shares: new anchor.BN(0)
    });

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.totalShares.toNumber(), 1 * 1e5);
    assert.equal(await market.quoteAta.getTokenBalance(), 1 * 1e5);
    let deposits = await market.marketAcc.getTotalDeposits();
    assert.equal(deposits.toNumber(), 1 * 1e5);

    const postLarryData = await market
    .get_lender_shares(larry.key.publicKey)
    .get_data();
    assert.equal(postLarryData, undefined);
    assert.equal(await larry.get_quo_balance(), BigInt(999 * 1e5));

    const lenderSharesAccountData2 = await market
      .get_lender_shares(lizz.key.publicKey)
      .get_data();
    assert.equal(lenderSharesAccountData2.shares.toNumber(), 1 * 1e5);
    assert.equal(await lizz.get_quo_balance(), BigInt(1000 * 1e5));
  });
});
