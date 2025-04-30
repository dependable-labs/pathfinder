import * as anchor from "@coral-xyz/anchor";
import { ONE_DAY_TIMELOCK, TestUtils, TWENTY_FIVE_HOUR_TIMELOCK } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import assert from "assert";

describe("roles", () => {
  let test: TestUtils;
  let manager: ManagerFixture;
  let owen: UserFixture;
  let carol: UserFixture;
  let alice: UserFixture;
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
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    manager = await test.initManagerFixture([market]);

    await manager.createCustom({
      user: owen,
      symbol: "USDCM",
      name: "USDC Manager",
      owner: owen,
      allocator: owen,
      curator: owen,
      guardian: owen,
      feeRecipient: owen,
      skimRecipient: owen,
    }); 
  });

  it("should set curator role", async () => {
    const newCurator = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    await manager.setCurator({
      user: owen,
      newCurator: carol
    });

    const config = await manager.managerVaultConfigAcc.get_data();
    assert.equal(
      config.curator.toBase58(),
      carol.key.publicKey.toBase58(),
      "Curator should be updated"
    );
  })

  it("should revert when curator is already set", async () => {
    await manager.setCurator({
      user: owen,
      newCurator: carol
    });

    // Try to submit another timelock while one is pending
    await assert.rejects(
      async () => {
        await manager.setCurator({
          user: owen,
          newCurator: carol
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
  })

  it("should set allocator role", async () => {
    const newAllocator = await test.createUser(
      new anchor.BN(0), 
      new anchor.BN(0)
    );

    await manager.setAllocator({
      user: owen,
      newAllocator: alice,
      isAllocator: true
    });

    const allocator = await (await manager.get_allocator(alice.key.publicKey))?.get_data();
    assert.equal(
        allocator?.isAllocator,
        true,
      "Allocator should be updated"
    );
  });

  it("test unset allocator role", async () => {

    await manager.setAllocator({
      user: owen,
      newAllocator: alice,
      isAllocator: true
    });

    const allocator = await manager.allocator.get_data();
    assert.equal(
        allocator.isAllocator,
        true,
      "Allocator should be updated"
    );

    await manager.setAllocator({
      user: owen,
      newAllocator: alice,
      isAllocator: false
    });

    const allocator2 = await manager.allocator.get_data();
    assert.equal(
        allocator2.isAllocator,
        false,
      "Allocator should be updated"
    );
  });

  it("test set allocator should revert already set", async () => {
    await manager.setAllocator({
      user: owen,
      newAllocator: alice,
      isAllocator: true
    });

    await assert.rejects(
      async () => {
        await manager.setAllocator({
          user: owen,
          newAllocator: alice,
          isAllocator: true
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

  it("test owner functions should revert when not owner", async () => {
    await assert.rejects(
      async () => {
        await manager.setCurator({
          user: alice,
          newCurator: alice
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await manager.setAllocator({
          user: alice,
          newAllocator: alice,
          isAllocator: true
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await manager.submitTimelock({
          user: alice,
          newTimelock: new anchor.BN(1)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await manager.submitGuardian({
          user: alice,
          newGuardian: alice
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
        return true;
      }
    );
  });

it("should revert curator functions when caller is not curator", async () => {
  await assert.rejects(
    async () => {
      await manager.submitCap({
        user: alice,
        marketId: market.marketAcc.key,
        supplyCap: new anchor.BN(1000)
      });
    },
    (err: anchor.AnchorError) => {
      assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
      return true;
    }
  );
});

  
  

it("should revert curator/guardian functions when caller is not curator or guardian", async () => {
  await manager.submitCap({
    user: owen,
    marketId: market.marketAcc.key,
    supplyCap: new anchor.BN(1000)
  });

  await assert.rejects(
    async () => {
      await manager.revokePendingCap({
        user: alice,
        marketId: market.marketAcc.key
      });
    },
    (err: anchor.AnchorError) => {
      assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
      return true;
    }
  );

  // TODO: add submit market removal ( after seeing how that works in account based program)

});

it("should revert guardian functions when caller is not guardian", async () => {
  await assert.rejects(
    async () => {
      await manager.revokePendingTimelock({
        user: alice,
      });
    },
    (err: anchor.AnchorError) => {
      assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await manager.revokePendingGuardian({
        user: alice,
      });
    },
    (err: anchor.AnchorError) => {
      assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
      return true;
    }
  );
});

// TODO: finalize test when queue methods are implemented
// it("should revert allocator functions when caller is not allocator", async () => {
  // await assert.rejects(
  //   async () => {
  //     await manager.setSupplyQueue({
  //       user: alice,
  //       supplyQueue: []
  //     });
  //   },
  //   (err: anchor.AnchorError) => {
  //     assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
  //     return true;
  //   }
  // );

  // await assert.rejects(
  //   async () => {
  //     await manager.updateWithdrawQueue({
  //       user: alice,
  //       withdrawQueue: []
  //     });
  //   },
  //   (err: anchor.AnchorError) => {
  //     assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
  //     return true;
  //   }
  // );

  // await assert.rejects(
  //   async () => {
  //     await manager.reallocate({
  //       user: alice,
  //       allocation: []
  //     });
  //   },
  //   (err: anchor.AnchorError) => {
  //     assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
  //     return true;
  //   }
  // );
// });

it("should allow curator or owner to trigger curator functions", async () => {

  // Test owner can set curator
  await manager.setCurator({
    user: owen,
    newCurator: carol
  });

  // Test curator is set correctly
  const configData = await manager.managerVaultConfigAcc.get_data();
  assert.equal(configData.curator.toString(), carol.key.publicKey.toString());

  // Test owner can submit cap
  await manager.submitCap({
    user: owen,
    marketId: market.marketAcc.key,
    supplyCap: new anchor.BN(1000)
  });

  await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() + 1);

  // Test owner can accept cap
  await manager.acceptCap({
    user: owen,
    marketId: market.marketAcc.key,
  });

  // Test curator can submit cap after being set
  await manager.submitCap({
    user: carol,  
    marketId: market.marketAcc.key,
    supplyCap: new anchor.BN(10001)
  });

  await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() + 1);
  
  // Test curator can accept cap
  await manager.acceptCap({
    user: carol,
    marketId: market.marketAcc.key,
  });
});

// TODO: add test for allocator functions when implemented
// it("should allow allocator, curator or owner to trigger allocator functions", async () => {
//   const supplyQueue = [market.marketAcc.key];
//   const withdrawQueueFromRanks = [new anchor.BN(0)];
//   const allocation: any[] = [];

//   // Test owner can trigger functions
//   await manager.setSupplyQueue({
//     user: owen,
//     supplyQueue
//   });

//   await manager.updateWithdrawQueue({
//     user: owen,
//     withdrawQueueFromRanks
//   });

//   await manager.reallocate({
//     user: owen,
//     allocation
//   });

//   // Test curator can trigger functions
//   await manager.setSupplyQueue({
//     user: carol,
//     supplyQueue
//   });

//   await manager.updateWithdrawQueue({
//     user: carol,
//     withdrawQueueFromRanks
//   });

//   await manager.reallocate({
//     user: carol,
//     allocation
//   });

//   // Test allocator can trigger functions
//   await manager.setSupplyQueue({
//     user: alice,
//     supplyQueue
//   });

//   await manager.updateWithdrawQueue({
//     user: alice,
//     withdrawQueueFromRanks
//   });

//   await manager.reallocate({
//     user: alice,
//     allocation
//   });
// });
})

  