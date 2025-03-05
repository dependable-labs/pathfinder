import * as anchor from "@coral-xyz/anchor";
import { TestUtils } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import { AssistantToTheRegionalManager } from "../../../target/types/assistant_to_the_regional_manager";
import assert from "assert";

describe("submit_cap", () => {
  let test: TestUtils;
  let manager: ManagerFixture;
  let owen: UserFixture;
  let futarchy: UserFixture;
  let market: MarketFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
    });

    owen = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    manager = await test.initManagerFixture(); 

    await manager.create({
      user: owen,
      symbol: "USDCM",
      name: "USDC Manager",
    });
  });

  it("successfully submits increase cap", async () => {

    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // assert market config pending cap is set / increased
    const marketConfig = await manager.get_market_config(market.marketAcc.key).get_data();
    assert.equal(marketConfig.pendingCap.toNumber(), "1000000000000000");

    // assert error if market cap is already pending
    await assert.rejects(
      async () => {
        await manager.submitCap({
          user: owen,
          marketId: market.marketAcc.key,
          supplyCap: new anchor.BN(1_000_001 * 1e9),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Market cap is already pending");
        return true;
      }
    );
  });

  // it("successfully reduces cap", async () => {
  // });

  // it("fails if market is pending removal", async () => {
  // });

  // it("fails if market is pending removal", async () => {
  // });

  // it("fails if current cap is same as new cap", async () => {
  // });
});
