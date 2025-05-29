import * as anchor from "@coral-xyz/anchor";
import { ONE_DAY_TIMELOCK, TestUtils } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import { AssistantToTheRegionalManager } from "../../../target/types/assistant_to_the_regional_manager";
import assert from "assert";
import { Keypair } from "@solana/web3.js";

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

    await test.initPathfinderProgram({
      payerAndRecipient: owen,
      authority: futarchy,
    });

    market = await test.createMarket({
      user: futarchy,
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9,
      authority: futarchy,
    });

    manager = await test.initManagerFixture([market]); 

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
    assert.equal(marketConfig.pendingCap.value.toNumber(), "1000000000000000");
    assert.equal(marketConfig.pendingCap.validAt.toNumber(), await test.getTimePlusTimelock());

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
        assert.strictEqual(err.error.errorMessage, "Already pending");
        return true;
      }
    );
  });

  it("successfully accepts cap", async () => {
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // assert market config pending cap is set / increased
    const marketConfigPostSubmit = await manager.get_market_config(market.marketAcc.key).get_data();
    assert.equal(marketConfigPostSubmit.pendingCap.value.toNumber(), "1000000000000000");
    assert.equal(marketConfigPostSubmit.pendingCap.validAt.toNumber(), await test.getTimePlusTimelock());

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    // assert market config pending cap is set / increased
    const marketConfigPostAccept = await manager.get_market_config(market.marketAcc.key).get_data();
    assert.equal(marketConfigPostAccept.pendingCap.value.toNumber(), 0);
    assert.equal(marketConfigPostAccept.pendingCap.validAt.toNumber(), 0);
    assert.equal(marketConfigPostAccept.cap.toNumber(), "1000000000000000");
  });

  it("successfully reduces cap", async () => {
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // assert market config pending cap is set / increased
    const marketConfigPostSubmit = await manager.get_market_config(market.marketAcc.key).get_data();
    assert.equal(marketConfigPostSubmit.pendingCap.value.toNumber(), "1000000000000000");
    assert.equal(marketConfigPostSubmit.pendingCap.validAt.toNumber(), await test.getTimePlusTimelock());
    assert.equal(marketConfigPostSubmit.cap.toNumber(), "0");

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    // assert market config pending cap is set / increased
    const marketConfigPostAccept = await manager.get_market_config(market.marketAcc.key).get_data();
    assert.equal(marketConfigPostAccept.pendingCap.value.toNumber(), 0);
    assert.equal(marketConfigPostAccept.pendingCap.validAt.toNumber(), 0);
    assert.equal(marketConfigPostAccept.cap.toNumber(), "1000000000000000");

    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(500_000 * 1e9),
    });

    // assert market config pending cap is set / increased
    const marketConfigPostSubmit2 = await manager.get_market_config(market.marketAcc.key).get_data();
    assert.equal(marketConfigPostSubmit2.pendingCap.value.toNumber(), 0);
    assert.equal(marketConfigPostSubmit2.pendingCap.validAt.toNumber(), 0);
    assert.equal(marketConfigPostSubmit2.cap.toNumber(), "500000000000000");
  });

  it("fails if market is pending removal", async () => {
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(0),
    });

    await manager.submitMarketRemoval({
      user: owen,
      marketId: market.marketAcc.key,
    });

    await assert.rejects(
      async () => {
        await manager.submitCap({
          user: owen,
          marketId: market.marketAcc.key,
          supplyCap: new anchor.BN(1_000_000 * 1e9),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Market is pending removal");
        return true;
      }
    );
  });

  it("fails if current cap is same as new cap", async () => {
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // assert market config pending cap is set / increased
    const marketConfigPostSubmit = await manager.get_market_config(market.marketAcc.key).get_data();
    assert.equal(marketConfigPostSubmit.pendingCap.value.toNumber(), "1000000000000000");
    assert.equal(marketConfigPostSubmit.pendingCap.validAt.toNumber(), await test.getTimePlusTimelock());
    assert.equal(marketConfigPostSubmit.cap.toNumber(), "0");

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    // assert market config pending cap is set / increased
    const marketConfigPostAccept = await manager.get_market_config(market.marketAcc.key).get_data();
    assert.equal(marketConfigPostAccept.pendingCap.value.toNumber(), 0);
    assert.equal(marketConfigPostAccept.pendingCap.validAt.toNumber(), 0);
    assert.equal(marketConfigPostAccept.cap.toNumber(), "1000000000000000");

    await assert.rejects(
      async () => {
        await manager.submitCap({
          user: owen,
          marketId: market.marketAcc.key,
          supplyCap: new anchor.BN(1_000_000 * 1e9),
        });
      },
      (err: anchor.AnchorError) => {
        try {
          assert.strictEqual(err.error.errorMessage, "Already set");
        } catch {
          // happens when banks client submits the same transaction twice, thinks its already processed
          assert.ok(err.toString().includes("transaction has already been processed"));
        }
        return true;
      }
    );
  });

  it("should not allow submitting cap for non-existent market", async () => {
    // Try to submit cap for a market that doesn't exist
    const fakeMarketId = Keypair.generate().publicKey;

    await assert.rejects(
      async () => {
        await manager.submitCapCustom({
          user: owen,
          marketId: fakeMarketId, 
          supplyCap: new anchor.BN(1_000_000 * 1e9),
          market: fakeMarketId,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "The program expected this account to be already initialized");
        return true;
      }
    );
  });

  it("should not allow submitting cap when already set", async () => {

    // Submit first cap increase
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() + 1);

    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    await assert.rejects(
      async () => {
        await manager.submitCap({
          user: owen,
          marketId: market.marketAcc.key,
          supplyCap: new anchor.BN(1_000_000 * 1e9),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Already set");
        return true;
      }
    );
  });

  it("should not allow submitting cap when already pending", async () => {
    // Submit first cap increase
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // Try to submit another cap change while first is still pending
    await assert.rejects(
      async () => {
        await manager.submitCap({
          user: owen,
          marketId: market.marketAcc.key,
          supplyCap: new anchor.BN(2_000_000 * 1e9),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Already pending");
        return true;
      }
    );
  });


  it("should successfully submit market removal", async () => {

    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });
  
    // First set cap to 0
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(0),
    });

    // Submit market for removal
    await manager.submitMarketRemoval({
      user: owen,
      marketId: market.marketAcc.key,
    });

    // Verify market config state
    const marketConfig = await manager.get_market_config(market.marketAcc.key).get_data();

    assert.equal(marketConfig.cap.toString(), "0");
    assert.equal(marketConfig.removableAt.toString(), (await test.getTimePlusTimelock()).toString());
  });

  it("should fail to submit market removal when cap is pending", async () => {

    // submit cap to enable market
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    // set cap to 0 (happens instantly)
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(0),
    });

    // submit cap to leave market in pending state
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    await assert.rejects(
      async () => {
        await manager.submitMarketRemoval({
          user: owen,
          marketId: market.marketAcc.key,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Pending cap");
        return true;
      }
    );
  });
});
