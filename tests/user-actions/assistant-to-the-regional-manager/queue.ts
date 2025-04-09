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

    await market.createAndSetAuthority({ user: owen });

    // metaMarket = await test.createMarket({
    //   symbol: "META",
    //   ltvFactor: new anchor.BN(0),
    //   price: new anchor.BN(100 * 1e9),
    //   conf: new anchor.BN(100 / 10 * 1e9),
    //   expo: -9,
    //   feeRecipient: futarchy,
    //   authority: futarchy,
    // });

    // await metaarket.createAndSetAuthority({ user: owen });

    // initialize and create a market config
    manager = await test.initManagerFixture(market); 

    await manager.create({
      user: owen,
      symbol: "USDCM",
      name: "USDC Manager",
    });

  });

  it("errors if market config acc for pathfinder market has not been initialized", async () => {
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


it("should not allow submitting cap for market pending removal", async () => {

  await manager.setCurator({
    user: owen,
    newCurator: carol,
  })

  await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() + 1);

  // Start acting as curator
  await manager.submitCap({
    user: carol,
    marketId: market.marketAcc.key,
    supplyCap: new BN(1e9)
  })

  await assert.rejects(
    async () => {
      await manager.submitMarketRemoval({
        user: carol,
        marketId: market.marketAcc.key,
      })
    },
    (err: anchor.AnchorError) => {
      assert.strictEqual(err.error.errorMessage, "Market is not enabled");
      return true;
    }
  );
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

it("should reject setting supply queue when exceeding max length", async () => {
  // Create supply queue that exceeds max length
  const supplyQueue = Array(11).fill(market.marketAcc.key);

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


it("should reject setting supply queue with unauthorized market", async () => {

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

// it("should successfully update withdraw queue", async () => {
// })

// it("should successfully update withdraw queue after removing disabled market", async () => {
//   // Set cap to 0 for market to be removed
//   await manager.submitCap({
//     user: owen, 
//     marketId: market.marketAcc.key,
//     supplyCap: new anchor.BN(0)
//   });
//
//   // Submit market for removal
//   await manager.submitMarketRemoval({
//     user: owen,
//     marketId: market.marketAcc.key
//   });
//
//   // Move past timelock period
//   await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() + 1);
//
//   // Create expected withdraw queue order
//   const withdrawQueue = [
//     idleMarket.marketAcc.key,
//     market2.marketAcc.key, 
//     market1.marketAcc.key
//   ];
//
//   // Update withdraw queue
//   await manager.setWithdrawQueue({
//     user: owen,
//     marketIds: withdrawQueue
//   });
//
//   // Verify queue order matches expected
//   const queue = await manager.queue.getWithdrawQueue();
//   assert.equal(queue[0].toBase58(), withdrawQueue[0].toBase58());
//   assert.equal(queue[1].toBase58(), withdrawQueue[1].toBase58());
//   assert.equal(queue[2].toBase58(), withdrawQueue[2].toBase58());
//
//   // Verify removed market is disabled
//   const marketConfig = await manager.get_market_config(market.marketAcc.key).get_data();
//   assert.equal(marketConfig.enabled, false);
//   assert.equal(marketConfig.pendingCap.value.toNumber(), 0);
//   assert.equal(marketConfig.pendingCap.validAt.toNumber(), 0);
// });


// it("should fail to update withdraw queue with invalid index", async () => {
//   // Try to set withdraw queue with invalid market index
//   await assert.rejects(
//     async () => {
//       await manager.setWithdrawQueue({
//         user: owen,
//         marketIds: [
//           market1.marketAcc.key,
//           market2.marketAcc.key,
//           market3.marketAcc.key,
//           invalidMarket.marketAcc.key // Invalid market that doesn't exist
//         ]
//       });
//     },
//     (err: anchor.AnchorError) => {
//       assert.strictEqual(err.error.errorMessage, "Invalid market index");
//       return true;
//     }
//   );
// });

// it("should not allow duplicate markets in withdraw queue", async () => {
//   // Try to set withdraw queue with duplicate market
//   await assert.rejects(
//     async () => {
//       await manager.setWithdrawQueue({
//         user: owen,
//         marketIds: [
//           market1.marketAcc.key,
//           market2.marketAcc.key,
//           market1.marketAcc.key, // Duplicate market
//           market3.marketAcc.key
//         ]
//       });
//     },
//     (err: anchor.AnchorError) => {
//       assert.strictEqual(err.error.errorMessage, "Duplicate market");
//       return true;
//     }
//   );
// });

// it("should not allow updating withdraw queue when market has non-zero supply", async () => {
//   // Set initial balance and deposit
//   await test.mintTo({
//     user: supplier,
//     amount: new anchor.BN(1e9)
//   });
//   
//   await manager.deposit({
//     user: supplier,
//     amount: new anchor.BN(1e9),
//     receiver: receiver.key.publicKey
//   });
//
//   // Try to update withdraw queue with market that has supply
//   await manager.submitCap({
//     user: owen,
//     marketId: market.marketAcc.key,
//     supplyCap: new anchor.BN(0)
//   });
//
//   await assert.rejects(
//     async () => {
//       await manager.setWithdrawQueue({
//         user: allocator,
//         marketIds: [
//           market1.marketAcc.key,
//           market2.marketAcc.key,
//           market3.marketAcc.key
//         ]
//       });
//     },
//     (err: anchor.AnchorError) => {
//       assert.strictEqual(err.error.errorMessage, "Invalid market removal - non-zero supply");
//       return true;
//     }
//   );
// });

// it("should not allow updating withdraw queue when market has non-zero cap", async () => {
//   // Try to update withdraw queue with market that has non-zero cap
//   await assert.rejects(
//     async () => {
//       await manager.setWithdrawQueue({
//         user: allocator,
//         marketIds: [
//           market1.marketAcc.key,
//           market2.marketAcc.key,
//           market3.marketAcc.key
//         ]
//       });
//     },
//     (err: anchor.AnchorError) => {
//       assert.strictEqual(err.error.errorMessage, "Invalid market removal - non-zero cap");
//       return true;
//     }
//   );
// });

// it("should not allow updating withdraw queue when market removal timelock has not elapsed", async () => {
//   // Set up initial deposit
//   await test.setTokenBalance(supplier, new anchor.BN(1e9));
//   await manager.deposit({
//     user: supplier,
//     amount: new anchor.BN(1e9),
//     receiver: receiver.key.publicKey
//   });
//
//   // Set cap to 0 and submit market removal
//   await manager.submitCap({
//     user: owen,
//     marketId: market.marketAcc.key,
//     supplyCap: new anchor.BN(0)
//   });
//
//   await manager.submitMarketRemoval({
//     user: owen,
//     marketId: market.marketAcc.key
//   });
//
//   // Move time forward but not past timelock
//   await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() - 1);
//
//   // Try to update withdraw queue
//   await assert.rejects(
//     async () => {
//       await manager.setWithdrawQueue({
//         user: allocator,
//         marketIds: [
//           market1.marketAcc.key,
//           market2.marketAcc.key,
//           market3.marketAcc.key
//         ]
//       });
//     },
//     (err: anchor.AnchorError) => {
//       assert.strictEqual(err.error.errorMessage, "Invalid market removal - timelock not elapsed");
//       return true;
//     }
//   );
// });

// it("should not allow updating withdraw queue when market has pending cap", async () => {
//   // Submit cap change for market3
//   await manager.submitCap({
//     user: owen,
//     marketId: market3.marketAcc.key,
//     supplyCap: new anchor.BN(1_000_000 * 1e9)
//   });
//
//   // Try to update withdraw queue while market3 has pending cap
//   await assert.rejects(
//     async () => {
//       await manager.setWithdrawQueue({
//         user: allocator,
//         marketIds: [
//           market1.marketAcc.key,
//           market3.marketAcc.key, 
//           market2.marketAcc.key
//         ]
//       });
//     },
//     (err: anchor.AnchorError) => {
//       assert.strictEqual(err.error.errorMessage, "Market has pending cap");
//       return true;
//     }
//   );
// });

// it("should enable market with liquidity", async () => {
//   const deposited = new anchor.BN(1_000_000 * 1e9);
//   const additionalSupply = new anchor.BN(500_000 * 1e9);
//
//   // Set up supply queue with first market
//   await manager.setSupplyQueue({
//     user: allocator,
//     marketIds: [market1.marketAcc.key]
//   });
//
//   // Set cap for first market
//   await manager.submitCap({
//     user: owen,
//     marketId: market1.marketAcc.key,
//     supplyCap: deposited
//   });
//
//   await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() + 1);
//   await manager.acceptCap({
//     user: owen,
//     marketId: market1.marketAcc.key
//   });
//
//   // Fund supplier account
//   await test.mintTo({
//     amount: deposited.add(additionalSupply),
//     recipient: supplier.key.publicKey,
//     mint: test.quoteMint
//   });
//
//   // Supplier deposits and supplies
//   await manager.deposit({
//     user: supplier,
//     amount: deposited,
//     onBehalfOf: supplier
//   });
//
//   await manager.supply({
//     user: supplier,
//     marketId: market4.marketAcc.key,
//     amount: additionalSupply
//   });
//
//   // Fund borrower collateral
//   const collateral = deposited.mul(new anchor.BN(2)); // 2x collateral ratio
//   await test.mintTo({
//     amount: collateral,
//     recipient: borrower.key.publicKey,
//     mint: test.collateralMint
//   });
//
//   // Borrower supplies collateral and borrows
//   await manager.supplyCollateral({
//     user: borrower,
//     marketId: market1.marketAcc.key,
//     amount: collateral
//   });
//
//   await manager.borrow({
//     user: borrower,
//     marketId: market1.marketAcc.key,
//     amount: deposited
//   });
//
//   // Set cap for market4
//   await manager.submitCap({
//     user: owen,
//     marketId: market4.marketAcc.key,
//     supplyCap: new anchor.BN(1_000_000 * 1e9)
//   });
//
//   await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() + 1);
//   await manager.acceptCap({
//     user: owen,
//     marketId: market4.marketAcc.key
//   });
//
//   // Assert total assets
//   const totalAssets = await manager.getTotalAssets();
//   assert.equal(totalAssets.toString(), deposited.add(additionalSupply).toString());
// });

// it("should allow revoking pending changes without reverting", async () => {
  // await manager.revokePendingTimelock({
  //   user: owen
  // });

  // await manager.revokePendingGuardian({
  //   user: owen
  // });

  // await manager.revokePendingCap({
  //   user: owen,
  //   marketId: market.marketAcc.key
  // });

  // await manager.revokePendingMarketRemoval({
  //   user: owen,
  //   marketId: market.marketAcc.key
  // });
// });

});
