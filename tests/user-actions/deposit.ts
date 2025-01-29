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

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e5),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -5
    });  

    await market.create({ user: larry });

  });

  it("into a market", async () => {
    await market.deposit({
      user: larry,
      amount: new anchor.BN(1 * 1e5),
      shares: new anchor.BN(0)
    });

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.totalShares.toNumber(), 1 * 1e5);
    assert.equal(await market.quoteAta.getTokenBalance(), 1 * 1e5);
    let deposits = await market.marketAcc.getTotalDeposits();
    assert.equal(deposits.toNumber(), 1 * 1e5);

    const userSharesAccountData = await market
      .get_user_shares(larry.key.publicKey)
      .get_data();
    assert.equal(userSharesAccountData.shares.toNumber(), 1 * 1e5);
    assert.equal(await larry.get_quo_balance(), BigInt(999 * 1e5));
  });

  it("two users Deposit into a market", async () => {
    await market.deposit({
      user: larry,
      amount: new anchor.BN(5 * 1e5),
      shares: new anchor.BN(0)
    });

    await market.deposit({
      user: lizz,
      amount: new anchor.BN(5 * 1e5),
      shares: new anchor.BN(0)
    });

    const marketAccountData2 = await market.marketAcc.get_data();
    assert.equal(marketAccountData2.totalShares.toNumber(), 10 * 1e5);

    let deposits = await market.marketAcc.getTotalDeposits();
    assert.equal(deposits.toNumber(), 10 * 1e5);

    const userSharesAccountData2 = await market
      .get_user_shares(lizz.key.publicKey)
      .get_data();
    assert.equal(userSharesAccountData2.shares.toNumber(), 5 * 1e5);

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

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e5),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -5
    });  

    await market.create({ user: larry });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(5 * 1e9),
      shares: new anchor.BN(0)
    });

    const marketAccountData2 = await market.marketAcc.get_data();
    assert.equal(marketAccountData2.totalShares, 5 * 1e9);

    let deposits = await market.marketAcc.getTotalDeposits();
    assert.equal(deposits.toNumber(), 5 * 1e9);

    const userSharesAccountData2 = await market
      .get_user_shares(larry.key.publicKey)
      .get_data()
    assert.equal(userSharesAccountData2.shares.toNumber(), 5 * 1e9);

    assert.equal(await larry.get_quo_balance(), BigInt(995 * 1e9));
  });
});
