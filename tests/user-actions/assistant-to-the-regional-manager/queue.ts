import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TestUtils, PATHFINDER_PROGRAM_ID, deriveMarketConfigAccount } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import { AssistantToTheRegionalManager } from "../../../target/types/assistant_to_the_regional_manager";
import assert from "assert";

describe("queue", () => {
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

    // futarchy = await test.createUser(
    //   new anchor.BN(0),
    //   new anchor.BN(0)
    // );

    // market = await test.createMarket({
    //   symbol: "BONK",
    //   ltvFactor: new anchor.BN(0),
    //   price: new anchor.BN(100 * 1e9),
    //   conf: new anchor.BN(100 / 10 * 1e9),
    //   expo: -9,
    //   feeRecipient: futarchy,
    //   authority: futarchy,
    // });

    // // initialize and create a market config
    // manager = await test.initManagerFixture(); 

    // await manager.create({
    //   user: owen,
    //   symbol: "USDCM",
    //   name: "USDC Manager",
    // });
  });

  it("errors if market config acc for pathfinder market has not been initialized", async () => {

    // await assert.rejects(
    //   async () => {
    //     await manager.setsupplyqueue({
    //       user: owen,
    //       newsupplyqueue: [
    //         market.marketacc.key,
    //       ],
    //     });
    //   },
    //   (err: anchor.anchorerror) => {
    //     assert.strictequal(err.error.errormessage, "invalid market config");
    //     return true;
    //   }
    // ); 
  });
});
