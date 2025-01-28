import * as anchor from "@coral-xyz/anchor";
import assert from 'assert';
import { MarketFixture, ORACLE_CONFIG} from '../fixtures';
import { UserFixture } from "../fixtures";
import { TestUtils } from "../utils";

describe("Create Market Operations", () => {
  let test: TestUtils;
  let market: MarketFixture;
  let larry: UserFixture;

  beforeEach(async () => {

    test = await TestUtils.create({
      quoteDecimals: 9,
      collateralDecimals: 9,
    });

    larry = test.createUser();
    await larry.init_and_fund_accounts(new anchor.BN(999999999999), new anchor.BN(0))

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 10 ** 9),
      conf: new anchor.BN(100 / 10 * 10 ** 9),
      expo: -9
    });  
  });

  it("creates a market", async () => {

    await market.create({
      user: larry,
    });

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.totalShares.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowShares.toNumber(), 0);
    assert.equal(marketAccountData.lastAccrualTimestamp.toNumber(), await test.getTime());
    assert.equal(marketAccountData.rateAtTarget.toNumber(), 0);
    assert.equal(marketAccountData.depositIndex.toString(), "1000000000000000000");
    assert.equal(marketAccountData.borrowIndex.toString(), "1000000000000000000");
    assert.equal(
      Buffer.from(marketAccountData.oracle.feedId).toString('hex'),
      Buffer.from(ORACLE_CONFIG.BONK.id.slice(2), 'hex').toString('hex')
    );
  });

  it("fails to create a duplicate market", async () => {
    await market.create({
      user: larry,
    });

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.totalShares.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowShares.toNumber(), 0);
    assert.equal(marketAccountData.lastAccrualTimestamp.toNumber(), await test.getTime());
    assert.equal(marketAccountData.rateAtTarget.toNumber(), 0);
    assert.equal(marketAccountData.depositIndex.toString(), "1000000000000000000");
    assert.equal(marketAccountData.borrowIndex.toString(), "1000000000000000000");
    assert.equal(
      Buffer.from(marketAccountData.oracle.feedId).toString('hex'),
      Buffer.from(ORACLE_CONFIG.BONK.id.slice(2), 'hex').toString('hex')
    );

    await assert.rejects(
      async () => {
        await market.create({
          user: larry,
        });
      },
      (err: anchor.AnchorError) => {
        // errors with account already in use
        return true;
      },
      "attempts to create a duplicate market"
    );
  });

  it("fails to create a market where collateral and quote are the same", async () => {
  });

});
