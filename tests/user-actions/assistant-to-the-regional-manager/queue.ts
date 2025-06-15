import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { TestUtils, MAX_QUEUE_LENGTH, PATHFINDER_PROGRAM_ID, deriveMarketConfigAccount, ONE_DAY_TIMELOCK } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import { AssistantToTheRegionalManager } from "../../../target/types/assistant_to_the_regional_manager";
import assert from "assert";
import { SystemProgram } from "@solana/web3.js";

describe("queue", () => {
  let test: TestUtils;
  let manager: ManagerFixture;
  let owen: UserFixture;
  let carol: UserFixture;
  let alice: UserFixture;
  let futarchy: UserFixture;
  let dan: UserFixture;
  let market: MarketFixture;
  let metaMarket: MarketFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
    });

    owen = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    dan = await test.createUser(
      new anchor.BN(1_000_000 * 1e9),
      new anchor.BN(0)
    );

    carol = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    alice = await test.createUser(
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

    metaMarket = await test.createMarket({
      user: futarchy,
      symbol: "META",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9,
      authority: futarchy,
    });

    // initialize and create a market config
    manager = await test.initManagerFixture([market, metaMarket]); 

    await manager.create({
      user: owen,
      symbol: "USDCM",
      name: "USDC Manager",
    });

    await manager.setCurator({
      user: owen,
      newCurator: carol,
    })

  });

  it("should set supply queue correctly", async () => {

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
 
    // Create supply queue with two markets
    const supplyQueue = [
      market.marketAcc.key, // Using first market from fixture
    ];

    // Set the supply queue
    await manager.setSupplyQueue({
      user: owen,
      marketIds: supplyQueue
    })

    // Verify queue was set correctly
    const queueAccount = await manager.queue.getSupplyQueue();
    assert.deepEqual(queueAccount, supplyQueue);
  });

  it("errors if market config acc for pathfinder market has not been initialized", async () => {
    await assert.rejects(
      async () => {
        await manager.setSupplyQueue({
          user: owen,
          marketIds: [
            anchor.web3.Keypair.generate().publicKey,
          ],
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "The program expected this account to be already initialized");
        return true;
      }
    );
  });

it("should not allow submitting cap for market pending removal", async () => {

  // Start acting as curator
  await manager.submitCap({
    user: carol,
    marketId: market.marketAcc.key,
    supplyCap: new BN(1e9)
  })

  await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() + 1);

  await manager.acceptCap({
    user: carol,
    marketId: market.marketAcc.key,
  })

  await manager.submitCap({
    user: carol,
    marketId: market.marketAcc.key,
    supplyCap: new BN(0),
  })

  await manager.submitMarketRemoval({
    user: carol,
    marketId: market.marketAcc.key,
  })

  await assert.rejects(
    async () => {
      await manager.submitCap({
        user: carol,
        marketId: market.marketAcc.key,
        supplyCap: new BN(1e9)
      })
    },
    (err: anchor.AnchorError) => {
      assert.strictEqual(err.error.errorMessage, "Market is pending removal");
      return true;
    }
  );
});

it("should reject setting supply queue when exceeding max length", async () => {

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

  // Create supply queue that exceeds max length
  const supplyQueue = Array(MAX_QUEUE_LENGTH.toNumber() + 1).fill(market.marketAcc.key);

  // Attempt to set supply queue and expect rejection
  await assert.rejects(
    async () => {
      await manager.setSupplyQueue({
        user: owen,
        marketIds: supplyQueue
      });
    },
    (err: anchor.AnchorError) => {
      assert.strictEqual(err.error.errorMessage, "Max queue length exceeded");
      return true;
    }
  );
});


it("should reject setting supply queue with unauthorized market", async () => {[]
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

  // pass 1 day + 1hr for timelock
  await test.moveTimeForward(60 * 60 * 25);

  // Verify market is no longer authorized
  const marketConfig = manager.get_manager_market_config(market.marketAcc.key);
  const marketConfigData = await marketConfig.get_data();
  assert.equal(marketConfigData.cap.toNumber(), 0, "Market should be disabled");

  // Create supply queue with unauthorized market
  const supplyQueue = [market.marketAcc.key];

  // Attempt to set supply queue and expect rejection
  await assert.rejects(
    async () => {
      await manager.setSupplyQueue({
        user: owen,
        marketIds: supplyQueue
      });
    },
    (err: anchor.AnchorError) => {
      assert.strictEqual(err.error.errorMessage, "Unauthorized market");
      return true;
    }
  );
});

  it("should successfully reorder withdraw queue", async () => {
  // Submit initial cap for market
  await manager.submitCap({
    user: owen,
    marketId: market.marketAcc.key,
    supplyCap: new anchor.BN(1_000_000 * 1e9),
  });

  // Submit initial cap for market
  await manager.submitCap({
    user: owen,
    marketId: metaMarket.marketAcc.key,
    supplyCap: new anchor.BN(1_000_000 * 1e9),
  });

  // Wait for timelock to pass
  await test.moveTimeForward(60 * 60 * 25);

  // Accept the cap
  await manager.acceptCap({
    user: owen,
    marketId: market.marketAcc.key,
  });

  await manager.acceptCap({
    user: owen,
    marketId: metaMarket.marketAcc.key,
  });

  // Verify initial withdraw queue state
  const initialWithdrawQueue = [market.marketAcc.key, metaMarket.marketAcc.key];
  const initialWithdrawQueueData = await manager.queue.getWithdrawQueue();
  assert.equal(initialWithdrawQueueData[0].toBase58(), initialWithdrawQueue[0].toBase58());
  assert.equal(initialWithdrawQueueData[1].toBase58(), initialWithdrawQueue[1].toBase58());

  // Create reordered withdraw queue
  const updatedWithdrawQueue = [metaMarket.marketAcc.key, market.marketAcc.key];

  // Update withdraw queue order
  await manager.reorderWithdrawQueue({
    user: owen,
    marketIds: updatedWithdrawQueue
  });

  // Verify queue matches expected order
  const withdrawQueueData = await manager.queue.getWithdrawQueue();
  assert.equal(withdrawQueueData[0].toBase58(), updatedWithdrawQueue[0].toBase58());
  assert.equal(withdrawQueueData[1].toBase58(), updatedWithdrawQueue[1].toBase58());
});

  // it("should successfully remove disabled market", async () => {
  //   // Submit initial cap for market
  //   await manager.submitCap({
  //     user: owen,
  //     marketId: market.marketAcc.key,
  //     supplyCap: new anchor.BN(1_000_000 * 1e9),
  //   });

  //   // Submit initial cap for market
  //   await manager.submitCap({
  //     user: owen,
  //     marketId: metaMarket.marketAcc.key,
  //     supplyCap: new anchor.BN(1_000_000 * 1e9),
  //   });

  //   // Wait for timelock to pass
  //   await test.moveTimeForward(60 * 60 * 25);

  //   // Accept the cap
  //   await manager.acceptCap({
  //     user: owen,
  //     marketId: market.marketAcc.key,
  //   });

  //   await manager.acceptCap({
  //     user: owen,
  //     marketId: metaMarket.marketAcc.key,
  //   });

  //   // Verify initial withdraw queue state
  //   const initialWithdrawQueue = [market.marketAcc.key, metaMarket.marketAcc.key];
  //   const initialWithdrawQueueData = await manager.queue.getWithdrawQueue();
  //   assert.equal(initialWithdrawQueueData.length, 2);
  //   assert.equal(initialWithdrawQueueData[0].toBase58(), initialWithdrawQueue[0].toBase58());
  //   assert.equal(initialWithdrawQueueData[1].toBase58(), initialWithdrawQueue[1].toBase58());

  //   // Try to remove market before cap is set to 0
  //   await assert.rejects(
  //     async () => {
  //       await manager.removeFromWithdrawQueue({
  //         user: owen,
  //         market: market
  //       });
  //     },
  //     (err: anchor.AnchorError) => {
  //       console.log(err);
  //       assert.strictEqual(err.error.errorMessage, "Invalid market removal non-zero cap");
  //       return true;
  //     }
  //   );

  //   // Submit initial cap for market
  //   await manager.submitCap({
  //     user: owen,
  //     marketId: market.marketAcc.key,
  //     supplyCap: new anchor.BN(0),
  //   });

  //   // Update withdraw queue order
  //   await manager.removeFromWithdrawQueue({
  //     user: owen,
  //     market: market
  //   });

  //   const withdrawQueueData = await manager.queue.getWithdrawQueue();
  //   assert.equal(withdrawQueueData.length, 1);
  //   assert.equal(withdrawQueueData[0].toBase58(), metaMarket.marketAcc.key.toBase58());

  //   // Try to remove market again
  //   await assert.rejects(
  //     async () => {
  //       await manager.removeFromWithdrawQueue({
  //         user: owen,
  //         market: market
  //       });
  //     },
  //     (err: anchor.AnchorError) => {
  //       try {
  //         assert.strictEqual(err.error.errorMessage, "Market not in queue");
  //       } catch {
  //         // happens when banks client submits the same transaction twice, thinks its already processed
  //         assert.ok(err.toString().includes("transaction has already been processed"));
  //       }
  //       return true;
  //     }
  //   );
  // })


  // Market removal test scenario with deposits
  // • Set market cap to zero first (curator role)
  // • Submit market for removal (curator role)
  // • Wait for timelock period to elapse
  // • Check market still has funds (supplyShares > 0)
  // • Try removing from withdraw queue (allocator role)
  // • Confirm removal succeeds (config[id] is deleted)
  // • Verify market funds are still accessible
  it("remove market with non-zero supply", async () => {

    // submit caps
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    await manager.submitCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    // accept caps
    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    await manager.acceptCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
    });
 
    // set supply queue with two markets
    const supplyQueue = [
      market.marketAcc.key, // Using first market from fixture
      metaMarket.marketAcc.key,
    ];

    await manager.setSupplyQueue({
      user: owen,
      marketIds: supplyQueue
    })

    const queueAccount = await manager.queue.getSupplyQueue();
    assert.deepEqual(queueAccount, supplyQueue);

    // deposit assets
    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket],
      assets: new anchor.BN(500_000 * 1e9),
      customCU: 1_000_000,
    });

    // shared vault balance should be 500_000
    assert.equal(Number(await market.quoteAta.getTokenBalance()), 500_000 * 1e9);

    // Dan's balance should be reduced by deposit amount
    assert.equal(Number(await dan.get_quo_balance()), 500_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), 500_000 * 1e9);

    // manager vault owns shares in base market
    const postManagerVaultData = await market
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultData.shares.toNumber(), 500_000 * 1e9);

    // Verify dans shares were created correctly
    const danShares = await manager.get_supply_shares(dan.key.publicKey).get_data();
    assert.equal(danShares.shares.toNumber(), 500_000 * 1e9);

    // submit cap for market to remove
    await manager.submitCap({
      user: owen,
      marketId:  market.marketAcc.key,
      supplyCap: new anchor.BN(0),
    });

    // verify removable_at is 0 before market removal submission
    const preRemovalMarketConfig = await manager.get_manager_market_config(market.marketAcc.key).get_data();
    assert.equal(preRemovalMarketConfig.removableAt.toNumber(), 0);

    await manager.submitMarketRemoval({
      user: owen,
      marketId: market.marketAcc.key,
    });

    // verify removable_at is set correctly
    const postRemovalMarketConfig = await manager.get_manager_market_config(market.marketAcc.key).get_data();
    assert.equal(postRemovalMarketConfig.removableAt.toNumber(), await test.getTimePlusTimelock());

    // Try to remove market before timelock elapses
    await assert.rejects(
      async () => {
        await manager.removeFromWithdrawQueue({
          user: owen,
          market: market,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Invalid market removal timelock not elapsed");
        return true;
      }
    );

    // verify lastTotalAssets is still correct after market removal submission
    const postSubmitConfigData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(postSubmitConfigData.lastTotalAssets.toNumber(), 500_000 * 1e9);

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    // TODO: add reallocate call here prior to withdrawing
    await manager.removeFromWithdrawQueue({
      user: carol,
      market: market,
    });

    // verify market is removed
    const marketConfig = manager.get_manager_market_config(market.marketAcc.key);
    const marketConfigData = await marketConfig.get_data();
    assert.equal(marketConfigData.cap.toNumber(), 0, "Market should be disabled");

    // verify market is removed from withdraw queue
    const withdrawQueueData = await manager.queue.getWithdrawQueue();
    assert.equal(withdrawQueueData.length, 1);
    assert.equal(withdrawQueueData[0].toBase58(), metaMarket.marketAcc.key.toBase58());

    // verify manager vault still holds shares in removed market
    const postRemovalManagerVaultData = await market
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postRemovalManagerVaultData.shares.toNumber(), 500_000 * 1e9);

    const postRemovalConfigData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(postRemovalConfigData.lastTotalAssets.toNumber(), 500_000 * 1e9);

    // verify supply queue doesn't change unless setSupplyQueue is called
    const finalSupplyQueueData = await manager.queue.getSupplyQueue();
    assert.equal(finalSupplyQueueData.length, 2);
    assert.equal(finalSupplyQueueData[0].toBase58(), market.marketAcc.key.toBase58());
    assert.equal(finalSupplyQueueData[1].toBase58(), metaMarket.marketAcc.key.toBase58());

    // verify lastTotalAssets is still correct after market removal
    const finalConfigData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(finalConfigData.lastTotalAssets.toNumber(), 500_000 * 1e9);



    // re-add market to withdraw queue
    await manager.submitCap({
      user: owen,
      marketId:  market.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    });

    // elapsed timelock
    await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber());

    // accept cap
    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    // verify lastTotalAssets is increased by the amount of the existing deposit in the market
    // TODO: I think this is an error, since we have double counted the assets in market here
    const afterAcceptConfig = await manager.managerVaultConfigAcc.get_data();
    assert.equal(afterAcceptConfig.lastTotalAssets.toNumber(), 1_000_000 * 1e9);

    // verify market is back in withdraw queue
    const newWithdrawQueue = await manager.queue.getWithdrawQueue();
    assert.equal(newWithdrawQueue.length, 2);
    assert.equal(newWithdrawQueue[0].toBase58(), metaMarket.marketAcc.key.toBase58());
    assert.equal(newWithdrawQueue[1].toBase58(), market.marketAcc.key.toBase58());

    // verify supply queue matches withdraw queue
    const updatedSupplyQueueData = await manager.queue.getSupplyQueue();
    assert.equal(updatedSupplyQueueData.length, 2);
    assert.equal(updatedSupplyQueueData[1].toBase58(), metaMarket.marketAcc.key.toBase58());
    assert.equal(updatedSupplyQueueData[0].toBase58(), market.marketAcc.key.toBase58());

  });

  it("curator and allocator should be able to update withdraw queue", async () => {
    // Submit initial cap for market
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // Submit initial cap for market
    await manager.submitCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // Wait for timelock to pass
    await test.moveTimeForward(60 * 60 * 25);

    // Accept the cap
    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    await manager.acceptCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
    });

    // Verify initial withdraw queue state
    const initialWithdrawQueue = [market.marketAcc.key, metaMarket.marketAcc.key];
    const initialWithdrawQueueData = await manager.queue.getWithdrawQueue();
    assert.equal(initialWithdrawQueueData[0].toBase58(), initialWithdrawQueue[0].toBase58());
    assert.equal(initialWithdrawQueueData[1].toBase58(), initialWithdrawQueue[1].toBase58());

    // Create reordered withdraw queue
    const updatedWithdrawQueue = [metaMarket.marketAcc.key, market.marketAcc.key];

    // non-allocator, non-owner, non-curator should not be able to reorder withdraw queue
    await assert.rejects(
      async () => {
        await manager.reorderWithdrawQueue({
          user: futarchy, // non-allocator, non-owner, non-curator
          marketIds: updatedWithdrawQueue,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
        return true;
      }
    );

    // curator should be able to reorder withdraw queue
    await manager.reorderWithdrawQueue({
      user: carol, // curator
      marketIds: updatedWithdrawQueue,
    });

    // Verify queue matches expected order
    const withdrawQueueData = await manager.queue.getWithdrawQueue();
    assert.equal(withdrawQueueData[0].toBase58(), updatedWithdrawQueue[0].toBase58());
    assert.equal(withdrawQueueData[1].toBase58(), updatedWithdrawQueue[1].toBase58());

    // set alice as allocator
    await manager.setAllocator({
      user: owen,
      newAllocator: alice,
      isAllocator: true,
    });

    // Create reordered withdraw queue
    const aliceWithdrawQueue = [metaMarket.marketAcc.key, market.marketAcc.key];

    // alice should be able to reorder withdraw queue
    await manager.reorderWithdrawQueue({
      user: alice, // allocator
      marketIds: aliceWithdrawQueue,
    });
    
    // Verify queue matches expected order
    const aliceWithdrawQueueData = await manager.queue.getWithdrawQueue();
    assert.equal(aliceWithdrawQueueData[0].toBase58(), aliceWithdrawQueue[0].toBase58());
    assert.equal(aliceWithdrawQueueData[1].toBase58(), aliceWithdrawQueue[1].toBase58());

  })

  it("allocator should successfully remove disabled market", async () => {

    // Submit initial cap for market
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // Submit initial cap for market
    await manager.submitCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9),
    });

    // Wait for timelock to pass
    await test.moveTimeForward(60 * 60 * 25);

    // Accept the cap
    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    await manager.acceptCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
    });

    // Verify initial withdraw queue state
    const initialWithdrawQueue = [market.marketAcc.key, metaMarket.marketAcc.key];
    const initialWithdrawQueueData = await manager.queue.getWithdrawQueue();
    assert.equal(initialWithdrawQueueData.length, 2);
    assert.equal(initialWithdrawQueueData[0].toBase58(), initialWithdrawQueue[0].toBase58());
    assert.equal(initialWithdrawQueueData[1].toBase58(), initialWithdrawQueue[1].toBase58());

    // Submit initial cap for market
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(0),
    });

    // non-allocator, non-owner, non-curator should not be able to remove market
    await assert.rejects(
      async () => {
        await manager.removeFromWithdrawQueue({
          user: futarchy,
          market: market,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
        return true;
      }
    );

    // set alice as allocator
    await manager.setAllocator({
      user: owen,
      newAllocator: alice,
      isAllocator: true,
    });

    // allocator should be able to remove market
    await manager.removeFromWithdrawQueue({
      user: alice,
      market: market,
    });

    const withdrawQueueData = await manager.queue.getWithdrawQueue();
    assert.equal(withdrawQueueData.length, 1);
    assert.equal(withdrawQueueData[0].toBase58(), metaMarket.marketAcc.key.toBase58());

  })

  it("should not allow updating withdraw queue when market has pending cap", async () => {
    // Submit cap change for market
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_000 * 1e9)
    });

    await test.moveTimeForward(60 * 60 * 25);

    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    // Submit cap change for market
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(0)
    });

    // Submit cap change for market
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1_000_001 * 1e9)
    });

    // Try to update withdraw queue while market3 has pending cap
    await assert.rejects(
      async () => {
        await manager.removeFromWithdrawQueue({
          user: owen,
          market: market,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Pending cap");
        return true;
      }
    );
  });
});
