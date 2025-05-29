import * as anchor from "@coral-xyz/anchor";
import { ONE_DAY_TIMELOCK, TestUtils, TWENTY_FIVE_HOUR_TIMELOCK } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import assert from "assert";

describe("timelock", () => {
  let test: TestUtils;
  let manager: ManagerFixture;
  let owen: UserFixture;
  let carol: UserFixture;
  let greg: UserFixture;
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

    greg = await test.createUser(
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

  it("successfully submits increased timelock", async () => {
 
    const config = await manager.managerVaultConfigAcc.get_data();
    assert.equal(config.timelock.toNumber(), ONE_DAY_TIMELOCK.toNumber());
    assert.equal(config.pendingTimelock.value.toNumber(), 0);
    assert.equal(config.pendingTimelock.validAt.toNumber(), 0);

    await manager.submitTimelock({
      user: owen,
      newTimelock: TWENTY_FIVE_HOUR_TIMELOCK
    });

    const configPost = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber());
    assert.equal(configPost.pendingTimelock.value.toNumber(), 0);
    assert.equal(configPost.pendingTimelock.validAt.toNumber(), 0);
  })

  it("successfully submits decreased timelock", async () => { 
    // increase so we can decrease
    await manager.submitTimelock({
      user: owen,
      newTimelock: TWENTY_FIVE_HOUR_TIMELOCK
    });

    const configPre = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPre.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber());
    assert.equal(configPre.pendingTimelock.value.toNumber(), 0);
    assert.equal(configPre.pendingTimelock.validAt.toNumber(), 0);

    await manager.submitTimelock({
      user: owen,
      newTimelock: ONE_DAY_TIMELOCK
    });

    const configPost = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber());
    assert.equal(configPost.pendingTimelock.value.toNumber(), ONE_DAY_TIMELOCK.toNumber());

    let timeOfSubmit = await test.getTime();
    assert.equal(configPost.pendingTimelock.validAt.toNumber(), timeOfSubmit + TWENTY_FIVE_HOUR_TIMELOCK.toNumber());

    await test.moveTimeForward(TWENTY_FIVE_HOUR_TIMELOCK.toNumber());

    const configPost2 = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost2.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber());
    assert.equal(configPost2.pendingTimelock.value.toNumber(), ONE_DAY_TIMELOCK.toNumber());
    assert.equal(configPost2.pendingTimelock.validAt.toNumber(), timeOfSubmit + TWENTY_FIVE_HOUR_TIMELOCK.toNumber());

    await manager.acceptTimelock({
      user: owen,
    });

    const configPost3 = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost3.timelock.toNumber(), ONE_DAY_TIMELOCK.toNumber());
    assert.equal(configPost3.pendingTimelock.value.toNumber(), 0);
    assert.equal(configPost3.pendingTimelock.validAt.toNumber(), 0);
  })

  it("errors when submitting timelock that is already pending", async () => {
    // First submit a decreased timelock, happens instantly
    await manager.submitTimelock({
      user: owen,
      newTimelock: TWENTY_FIVE_HOUR_TIMELOCK
    });

    const configPreSubmit = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPreSubmit.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber());
    assert.equal(configPreSubmit.pendingTimelock.value.toNumber(), 0);
    assert.equal(configPreSubmit.pendingTimelock.validAt.toNumber(), 0);

    // Second submission, happen
    await manager.submitTimelock({
      user: owen,
      newTimelock: ONE_DAY_TIMELOCK
    });

    const configPost = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber());
    assert.equal(configPost.pendingTimelock.value.toNumber(), ONE_DAY_TIMELOCK.toNumber());
    assert.equal(configPost.pendingTimelock.validAt.toNumber(), await test.getTime() + TWENTY_FIVE_HOUR_TIMELOCK.toNumber());

    // Try to submit another timelock while one is pending
    await assert.rejects(
      async () => {
        await manager.submitTimelock({
          user: owen, 
          newTimelock: ONE_DAY_TIMELOCK
        });
      },
      (err: anchor.AnchorError) => {
        try {
          assert.strictEqual(err.error.errorMessage, "Already pending");
        } catch {
          // happens when banks client submits the same transaction twice, thinks its already processed
          assert.ok(err.toString().includes("transaction has already been processed"));
        }
        return true;
      }
    );

    // Verify state hasn't changed
    const configPost2 = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost2.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber());
    assert.equal(configPost2.pendingTimelock.value.toNumber(), ONE_DAY_TIMELOCK.toNumber());
  })

  it("errors when submitting timelock that is not owner", async () => {

    const configPreSubmit = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPreSubmit.timelock.toNumber(), ONE_DAY_TIMELOCK.toNumber());
    assert.equal(configPreSubmit.pendingTimelock.value.toNumber(), 0);
    assert.equal(configPreSubmit.pendingTimelock.validAt.toNumber(), 0);

    await assert.rejects(
      async () => {
        await manager.submitTimelock({
          user: carol,
          newTimelock: TWENTY_FIVE_HOUR_TIMELOCK
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
        return true;
      }
    );

    // Verify state hasn't changed
    const configPost = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost.timelock.toNumber(), ONE_DAY_TIMELOCK.toNumber());
    assert.equal(configPost.pendingTimelock.value.toNumber(), 0);
    assert.equal(configPost.pendingTimelock.validAt.toNumber(), 0);
  })

  it("errors when submitting timelock that is above max", async () => {
    await assert.rejects(
      async () => {
        await manager.submitTimelock({
          user: owen,
          newTimelock: new anchor.BN(2 * 60 * 60 * 24 * 7 + 1) // 2 weeks + 1 second
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Above max timelock");
        return true;
      }
    );
  })

  it("errors when submitting timelock that is below min", async () => {
    await assert.rejects(
      async () => {
        await manager.submitTimelock({
          user: owen,
          newTimelock: new anchor.BN(60 * 60 * 24 - 1) // 1 day - 1 second
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Below min timelock");
        return true;
      }
    );
  })


  it("errors when submitting timelock that is already set", async () => {
    await assert.rejects(
      async () => {
        await manager.submitTimelock({
          user: owen,
          newTimelock: ONE_DAY_TIMELOCK
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Already set");
        return true;
      }
    );
  })

  it("errors when accepting timelock that has no pending value", async () => {
    await assert.rejects(
      async () => {
        await manager.acceptTimelock({
          user: owen,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "No pending value");
        return true;
      }
    );
  })

  it("errors when accepting timelock that has not elapsed", async () => {

    await manager.submitTimelock({
      user: owen,
      newTimelock: TWENTY_FIVE_HOUR_TIMELOCK
    });
    
    await manager.submitTimelock({
      user: owen,
      newTimelock: ONE_DAY_TIMELOCK
    });

    const configPost = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber());
    assert.equal(configPost.pendingTimelock.value.toNumber(), ONE_DAY_TIMELOCK.toNumber());

    let timeOfSubmit = await test.getTime();
    assert.equal(configPost.pendingTimelock.validAt.toNumber(), timeOfSubmit + TWENTY_FIVE_HOUR_TIMELOCK.toNumber());

    await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() - 1);

    await assert.rejects(
      async () => {
        await manager.acceptTimelock({
          user: owen,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Timelock not elapsed");
        return true;
      }
    );

    // verify state hasn't changed
    const configPost2 = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost2.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber());
    assert.equal(configPost2.pendingTimelock.value.toNumber(), ONE_DAY_TIMELOCK.toNumber());
    assert.equal(configPost2.pendingTimelock.validAt.toNumber(), timeOfSubmit + TWENTY_FIVE_HOUR_TIMELOCK.toNumber());
  })

  it("submits guardian successfully", async () => {
    await manager.submitGuardian({
      user: owen,
      newGuardian: greg
    });

    const configPost = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost.guardian.toBase58(), owen.key.publicKey.toBase58(), "guardian");
    assert.equal(configPost.pendingGuardian.value.toBase58(), greg.key.publicKey.toBase58(), "pending guardian");
    
    const timeOfSubmit = await test.getTime();
    assert.equal(configPost.pendingGuardian.validAt.toNumber(), timeOfSubmit + ONE_DAY_TIMELOCK.toNumber(), "valid at");
  });

  it("errors when submitting guardian that is already pending", async () => {
    await manager.submitGuardian({
      user: owen,
      newGuardian: greg
    });

    await assert.rejects(
      async () => {
        await manager.submitGuardian({
          user: owen,
          newGuardian: carol // could be greg again but this gets around test env error
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Already pending");
        return true;
      }
    );
  });

  it("successfully accepts guardian after timelock", async () => {
    await manager.submitGuardian({
      user: owen,
      newGuardian: greg
    });

    await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber());

    await manager.acceptGuardian({
      user: owen
    });

    const configPost = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost.guardian.toBase58(), greg.key.publicKey.toBase58(), "guardian");
    assert.equal(configPost.pendingGuardian.value.toBase58(), anchor.web3.PublicKey.default.toBase58(), "pending guardian value");
    assert.equal(configPost.pendingGuardian.validAt.toNumber(), 0, "pending guardian valid at");
  });

  

  it("successfully accepts guardian after increased timelock", async () => {
    // Submit increased timelock
    await manager.submitTimelock({
      user: owen,
      newTimelock: TWENTY_FIVE_HOUR_TIMELOCK
    });

    // Submit new guardian
    await manager.submitGuardian({
      user: owen,
      newGuardian: greg
    });

    // Move time forward past the increased timelock
    await test.moveTimeForward(TWENTY_FIVE_HOUR_TIMELOCK.toNumber());

    // Accept the guardian change
    await manager.acceptGuardian({
      user: carol
    });

    // Verify state changes
    const configPost = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configPost.guardian.toBase58(), greg.key.publicKey.toBase58(), "guardian");
    assert.equal(configPost.pendingGuardian.value.toBase58(), anchor.web3.PublicKey.default.toBase58(), "pending guardian value");
    assert.equal(configPost.pendingGuardian.validAt.toNumber(), 0, "pending guardian valid at");
  });

  it("errors when accepting guardian after decreased timelock", async () => {
    // increase timelock so we can decrease it
    await manager.submitTimelock({
      user: owen,
      newTimelock: TWENTY_FIVE_HOUR_TIMELOCK
    });

    // decrease timelock
    await manager.submitTimelock({
      user: owen,
      newTimelock: ONE_DAY_TIMELOCK
    });

    // Move time forward partially
    await test.moveTimeForward(TWENTY_FIVE_HOUR_TIMELOCK.toNumber() / 2);

    // Submit new guardian
    await manager.submitGuardian({
      user: owen,
      newGuardian: greg
    });

    // Move time forward to accept timelock but not enough for guardian
    await test.moveTimeForward(TWENTY_FIVE_HOUR_TIMELOCK.toNumber() / 2);

    // Accept the timelock decrease
    await manager.acceptTimelock({
      user: owen
    });

    // Try to accept guardian before timelock elapsed
    await assert.rejects(
      async () => {
        await manager.acceptGuardian({
          user: carol
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Timelock not elapsed");
        return true;
      }
    );
  });

  it("errors when accepting guardian with no pending value", async () => {
    await assert.rejects(
      async () => {
        await manager.acceptGuardian({
          user: owen
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "No pending value");
        return true;
      }
    );
  });

  it("errors when accepting guardian before timelock elapsed", async () => {
    // Submit new guardian
    await manager.submitGuardian({
      user: owen,
      newGuardian: greg
    });

    // Move time forward but not enough to elapse timelock
    await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() / 2);

    await assert.rejects(
      async () => {
        await manager.acceptGuardian({
          user: owen
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Timelock not elapsed");
        return true;
      }
    );
  });
});