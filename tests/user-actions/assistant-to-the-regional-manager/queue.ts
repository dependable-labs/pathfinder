import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { TestUtils, PATHFINDER_PROGRAM_ID, deriveMarketConfigAccount, ONE_DAY_TIMELOCK } from "../../utils";
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

    metaMarket = await test.createMarket({
      symbol: "META",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    // await metaMarket.createAndSetAuthority({ authority: futarchy, payerAndRecipient: owen });
    return;

    // initialize and create a market config
    manager = await test.initManagerFixture([market, metaMarket]); 

    await manager.create({
      user: owen,
      symbol: "USDCM",
      name: "USDC Manager",
    });

  });

  it("errors if market config acc for pathfinder market has not been initialized", async () => {
    return;
    await assert.rejects(
      async () => {
        await manager.setSupplyQueue({
          user: owen,
          marketIds: [
            market.marketAcc.key,
          ],
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Invalid market config");
        return true;
      }
    );
  });

    // function testMintAllCapsReached() public {
    //   vm.prank(ALLOCATOR);
    //   vault.setSupplyQueue(new Id[](0));

    //   loanToken.setBalance(SUPPLIER, 1);

    //   vm.prank(SUPPLIER);
    //   loanToken.approve(address(vault), type(uint256).max);

    //   vm.expectRevert(ErrorsLib.AllCapsReached.selector);
    //   vm.prank(SUPPLIER);
    //   vault.mint(1, RECEIVER);
    // }

//     function testDepositAllCapsReached() public {
//       vm.prank(ALLOCATOR);
//       vault.setSupplyQueue(new Id[](0));

//       loanToken.setBalance(SUPPLIER, 1);

//       vm.prank(SUPPLIER);
//       loanToken.approve(address(vault), type(uint256).max);

//       vm.expectRevert(ErrorsLib.AllCapsReached.selector);
//       vm.prank(SUPPLIER);
//       vault.deposit(1, RECEIVER);
//     }


// it("should not allow submitting cap for market pending removal", async () => {

//   await manager.setCurator({
//     user: owen,
//     newCurator: carol,
//   })

//   await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() + 1);

//   // Start acting as curator
//   await manager.submitCap({
//     user: carol,
//     marketId: market.marketAcc.key,
//     supplyCap: new BN(1e9)
//   })

//   await assert.rejects(
//     async () => {
//       await manager.submitMarketRemoval({
//         user: carol,
//         marketId: market.marketAcc.key,
//       })
//     },
//     (err: anchor.AnchorError) => {
//       assert.strictEqual(err.error.errorMessage, "Market is not enabled");
//       return true;
//     }
//   );
// });

// it("should set supply queue correctly", async () => {

//   await manager.submitCap({
//     user: owen,
//     marketId: market.marketAcc.key,
//     supplyCap: new anchor.BN(1_000_000 * 1e9),
//   });

//   // pass 1 day + 1hr for timelock
//   await test.moveTimeForward(60 * 60 * 25);

//   await manager.acceptCap({
//     user: owen,
//     marketId: market.marketAcc.key,
//   });

  
//   // Create supply queue with two markets
//   const supplyQueue = [
//     market.marketAcc.key, // Using first market from fixture
//   ];

//   // Set the supply queue
//   await manager.setSupplyQueue({
//     user: owen,
//     marketIds: supplyQueue
//   })

//   // Verify queue was set correctly
//   const queueAccount = await manager.queue.getSupplyQueue();
//   assert.deepEqual(queueAccount, supplyQueue);
// });

// it("should reject setting supply queue when exceeding max length", async () => {
//   // Create supply queue that exceeds max length
//   const supplyQueue = Array(11).fill(market.marketAcc.key);

//   // Attempt to set supply queue and expect rejection
//   await assert.rejects(
//     async () => {
//       await manager.setSupplyQueue({
//         user: owen,
//         marketIds: supplyQueue
//       });
//     },
//     (err: anchor.AnchorError) => {
//       assert.strictEqual(err.error.errorMessage, "Max queue length exceeded");
//       return true;
//     }
//   );
// });


// it("should reject setting supply queue with unauthorized market", async () => {

//   await manager.submitCap({
//     user: owen,
//     marketId: market.marketAcc.key,
//     supplyCap: new anchor.BN(1_000_000 * 1e9),
//   });

//   // pass 1 day + 1hr for timelock
//   await test.moveTimeForward(60 * 60 * 25);

//   await manager.acceptCap({
//     user: owen,
//     marketId: market.marketAcc.key,
//   });

//   await manager.submitCap({
//     user: owen,
//     marketId: market.marketAcc.key,
//     supplyCap: new anchor.BN(0),
//   });

//   await manager.submitMarketRemoval({
//     user: owen,
//     marketId: market.marketAcc.key,
//   });

//   // Create supply queue with unauthorized market
//   const supplyQueue = [market.marketAcc.key];

//   // Attempt to set supply queue and expect rejection
//   await assert.rejects(
//     async () => {
//       await manager.setSupplyQueue({
//         user: owen,
//         marketIds: supplyQueue
//       });
//     },
//     (err: anchor.AnchorError) => {
//       assert.strictEqual(err.error.errorMessage, "Unauthorized market");
//       return true;
//     }
//   );
// });

//   it("should successfully reorderwithdraw queue", async () => {

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
//   assert.equal(initialWithdrawQueueData[0].toBase58(), initialWithdrawQueue[0].toBase58());
//   assert.equal(initialWithdrawQueueData[1].toBase58(), initialWithdrawQueue[1].toBase58());

//   // Create reordered withdraw queue
//   const updatedWithdrawQueue = [metaMarket.marketAcc.key, market.marketAcc.key];

//   // Update withdraw queue order
//   await manager.reorderWithdrawQueue({
//     user: owen,
//     marketIds: updatedWithdrawQueue
//   });

//   // Verify queue matches expected order
//   const withdrawQueueData = await manager.queue.getWithdrawQueue();
//   assert.equal(withdrawQueueData[0].toBase58(), updatedWithdrawQueue[0].toBase58());
//   assert.equal(withdrawQueueData[1].toBase58(), updatedWithdrawQueue[1].toBase58());
// });

//   it("should successfully remove disabled market", async () => {

//     // Submit initial cap for market
//     await manager.submitCap({
//       user: owen,
//       marketId: market.marketAcc.key,
//       supplyCap: new anchor.BN(1_000_000 * 1e9),
//     });

//     // Submit initial cap for market
//     await manager.submitCap({
//       user: owen,
//       marketId: metaMarket.marketAcc.key,
//       supplyCap: new anchor.BN(1_000_000 * 1e9),
//     });

//     // Wait for timelock to pass
//     await test.moveTimeForward(60 * 60 * 25);

//     // Accept the cap
//     await manager.acceptCap({
//       user: owen,
//       marketId: market.marketAcc.key,
//     });

//     await manager.acceptCap({
//       user: owen,
//       marketId: metaMarket.marketAcc.key,
//     });

//     // Verify initial withdraw queue state
//     const initialWithdrawQueue = [market.marketAcc.key, metaMarket.marketAcc.key];
//     const initialWithdrawQueueData = await manager.queue.getWithdrawQueue();
//     assert.equal(initialWithdrawQueueData.length, 2);
//     assert.equal(initialWithdrawQueueData[0].toBase58(), initialWithdrawQueue[0].toBase58());
//     assert.equal(initialWithdrawQueueData[1].toBase58(), initialWithdrawQueue[1].toBase58());

//     // Try to remove market before cap is set to 0
//     await assert.rejects(
//       async () => {
//         await manager.removeFromWithdrawQueue({
//           user: owen,
//           marketId: market.marketAcc.key
//         });
//       },
//       (err: anchor.AnchorError) => {
//         assert.strictEqual(err.error.errorMessage, "Invalid market removal non-zero cap");
//         return true;
//       }
//     );

//     // Submit initial cap for market
//     await manager.submitCap({
//       user: owen,
//       marketId: market.marketAcc.key,
//       supplyCap: new anchor.BN(0),
//     });

//     // Update withdraw queue order
//     await manager.removeFromWithdrawQueue({
//       user: owen,
//       marketId: market.marketAcc.key
//     });

//     const withdrawQueueData = await manager.queue.getWithdrawQueue();
//     assert.equal(withdrawQueueData.length, 1);
//     assert.equal(withdrawQueueData[0].toBase58(), metaMarket.marketAcc.key.toBase58());

//     // Try to remove market again
//     await assert.rejects(
//       async () => {
//         await manager.removeFromWithdrawQueue({
//           user: owen,
//           marketId: market.marketAcc.key
//         });
//       },
//       (err: anchor.AnchorError) => {
//         try {
//           assert.strictEqual(err.error.errorMessage, "Market not in queue");
//         } catch {
//           // happens when banks client submits the same transaction twice, thinks its already processed
//           assert.ok(err.toString().includes("transaction has already been processed"));
//         }
//         return true;
//       }
//     );
//   })


  // Market removal test scenario with deposits
  // • Set market cap to zero first (curator role)
  // • Submit market for removal (curator role)
  // • Wait for timelock period to elapse
  // • Check market still has funds (supplyShares > 0)
  // • Try removing from withdraw queue (allocator role)
  // • Confirm removal succeeds (config[id] is deleted)
  // • Verify market funds are still accessible
  // • Attempt deposits to removed market (should fail)
  it("should not fail to remove market with non-zero supply", async () => {
    // TODO: when deposit is implemented
  });

  it("should not allow updating withdraw queue when market removal timelock has not elapsed", async () => {
    // TODO: when deposit is implemented
  });

  // it("curator and allocator should be able to update withdraw queue", async () => {
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
  //   assert.equal(initialWithdrawQueueData[0].toBase58(), initialWithdrawQueue[0].toBase58());
  //   assert.equal(initialWithdrawQueueData[1].toBase58(), initialWithdrawQueue[1].toBase58());

  //   // Create reordered withdraw queue
  //   const updatedWithdrawQueue = [metaMarket.marketAcc.key, market.marketAcc.key];

  //   // non-allocator, non-owner, non-curator should not be able to reorder withdraw queue
  //   await assert.rejects(
  //     async () => {
  //       await manager.reorderWithdrawQueue({
  //         user: futarchy, // non-allocator, non-owner, non-curator
  //         marketIds: updatedWithdrawQueue,
  //       });
  //     },
  //     (err: anchor.AnchorError) => {
  //       assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
  //       return true;
  //     }
  //   );

  //   // set carol as curator
  //   await manager.setCurator({
  //     user: owen,
  //     newCurator: carol,
  //   });

  //   // wait for timelock to pass
  //   await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() + 1);

  //   // curator should be able to reorder withdraw queue
  //   await manager.reorderWithdrawQueue({
  //     user: carol, // curator
  //     marketIds: updatedWithdrawQueue,
  //   });

  //   // Verify queue matches expected order
  //   const withdrawQueueData = await manager.queue.getWithdrawQueue();
  //   assert.equal(withdrawQueueData[0].toBase58(), updatedWithdrawQueue[0].toBase58());
  //   assert.equal(withdrawQueueData[1].toBase58(), updatedWithdrawQueue[1].toBase58());

  //   // set alice as allocator
  //   await manager.setAllocator({
  //     user: owen,
  //     newAllocator: alice,
  //     isAllocator: true,
  //   });

  //   // Create reordered withdraw queue
  //   const aliceWithdrawQueue = [metaMarket.marketAcc.key, market.marketAcc.key];

  //   // alice should be able to reorder withdraw queue
  //   await manager.reorderWithdrawQueue({
  //     user: alice, // allocator
  //     marketIds: aliceWithdrawQueue,
  //   });
    
  //   // Verify queue matches expected order
  //   const aliceWithdrawQueueData = await manager.queue.getWithdrawQueue();
  //   assert.equal(aliceWithdrawQueueData[0].toBase58(), aliceWithdrawQueue[0].toBase58());
  //   assert.equal(aliceWithdrawQueueData[1].toBase58(), aliceWithdrawQueue[1].toBase58());

  // })

  // it("allocator should successfully remove disabled market", async () => {

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

  //   // Submit initial cap for market
  //   await manager.submitCap({
  //     user: owen,
  //     marketId: market.marketAcc.key,
  //     supplyCap: new anchor.BN(0),
  //   });

  //   // non-allocator, non-owner, non-curator should not be able to remove market
  //   await assert.rejects(
  //     async () => {
  //       await manager.removeFromWithdrawQueue({
  //         user: futarchy,
  //         marketId: market.marketAcc.key
  //       });
  //     },
  //     (err: anchor.AnchorError) => {
  //       assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
  //       return true;
  //     }
  //   );

  //   // set alice as allocator
  //   await manager.setAllocator({
  //     user: owen,
  //     newAllocator: alice,
  //     isAllocator: true,
  //   });

  //   // allocator should be able to remove market
  //   await manager.removeFromWithdrawQueue({
  //     user: alice,
  //     marketId: market.marketAcc.key
  //   });

  //   const withdrawQueueData = await manager.queue.getWithdrawQueue();
  //   assert.equal(withdrawQueueData.length, 1);
  //   assert.equal(withdrawQueueData[0].toBase58(), metaMarket.marketAcc.key.toBase58());

  // })

  // it("should not allow updating withdraw queue when market has pending cap", async () => {
  //   // Submit cap change for market
  //   await manager.submitCap({
  //     user: owen,
  //     marketId: market.marketAcc.key,
  //     supplyCap: new anchor.BN(1_000_000 * 1e9)
  //   });

  //   await test.moveTimeForward(60 * 60 * 25);

  //   await manager.acceptCap({
  //     user: owen,
  //     marketId: market.marketAcc.key,
  //   });

  //   // Submit cap change for market
  //   await manager.submitCap({
  //     user: owen,
  //     marketId: market.marketAcc.key,
  //     supplyCap: new anchor.BN(0)
  //   });

  //   // Submit cap change for market
  //   await manager.submitCap({
  //     user: owen,
  //     marketId: market.marketAcc.key,
  //     supplyCap: new anchor.BN(1_000_001 * 1e9)
  //   });

  //   // Try to update withdraw queue while market3 has pending cap
  //   await assert.rejects(
  //     async () => {
  //       await manager.removeFromWithdrawQueue({
  //         user: owen,
  //         marketId: market.marketAcc.key,
  //       });
  //     },
  //     (err: anchor.AnchorError) => {
  //       assert.strictEqual(err.error.errorMessage, "Pending cap");
  //       return true;
  //     }
  //   );
  // }); 

  // it("should enable market with liquidity", async () => {
  //   // TODO: when deposit is implemented
  // });

});
