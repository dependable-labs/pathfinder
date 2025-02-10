import * as anchor from "@coral-xyz/anchor";
import { TestUtils } from '../utils';
import { MarketFixture} from '../fixtures';
import assert from 'assert';
import { UserFixture } from "../fixtures";

describe("Create Market Operations", () => {
  let test: TestUtils;
  let market: MarketFixture;
  let accounts: any;
  let larry: UserFixture;
  let lizz: UserFixture;
  let futarchy: UserFixture;

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

    futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

  });

  it("creates a market", async () => {

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e5),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -5,
      feeRecipient: futarchy,
      authority: futarchy,
    }); 

    await market.createAndSetAuthority({ user: larry });

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.totalShares.toNumber(), 0);
    assert.equal(marketAccountData.depositIndex.toString(), "1000000000000000000");
    assert.equal(marketAccountData.borrowIndex.toString(), "1000000000000000000");
    assert.equal(await market.quoteAta.getTokenBalance(), 0);
    let deposits = await market.marketAcc.getTotalDeposits();
    assert.equal(deposits.toNumber(), 0);
  });

  it("fails to create a duplicate market", async () => {

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e5), 
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -5,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    await market.createAndSetAuthority({ user: larry });

    await assert.rejects(
      async () => {
        await market.create({ user: larry });
      },
      (err: anchor.AnchorError) => {
        // Account already exists error
        return true;
      },
      "Expected market creation to fail when market already exists"
    );
  });

  it("fails to create a market where the collateral mint is the same as the quote mint", async () => {
  });
});