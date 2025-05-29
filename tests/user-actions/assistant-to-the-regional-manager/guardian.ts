
import * as anchor from "@coral-xyz/anchor";
import { ONE_DAY_TIMELOCK, TestUtils, TWENTY_FIVE_HOUR_TIMELOCK } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import assert from "assert";
import { PublicKey } from "@solana/web3.js";

describe("guardian", () => {
  let test: TestUtils;
  let manager: ManagerFixture;
  let owen: UserFixture;
  let carol: UserFixture;
  let greg: UserFixture;
  let garry: UserFixture;
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

    garry = await test.createUser(
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

    // Submit greg as new guardian
    await manager.submitGuardian({
      user: owen,
      newGuardian: greg
    });

    // Move time forward past timelock
    await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber());

    // Accept greg as new guardian
    await manager.acceptGuardian({
      user: greg
    });

    // Verify greg is now guardian
    const config = await manager.managerVaultConfigAcc.get_data();
    assert.equal(config.guardian.toBase58(), greg.key.publicKey.toBase58());

  });

  it("errors when non-owner submits guardian", async () => {
    await assert.rejects(
      async () => {
        await manager.submitGuardian({
          user: carol,
          newGuardian: owen
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
        return true;
      }
    );
  });

  it("guardian can revoke pending timelock decrease", async () => {
    // Submit increased timelock as owner
    await manager.submitTimelock({
      user: owen,
      newTimelock: TWENTY_FIVE_HOUR_TIMELOCK,
    });

    // Submit decreased timelock as owner
    await manager.submitTimelock({
      user: owen,
      newTimelock: ONE_DAY_TIMELOCK,
    });

    // Move time forward but not past timelock
    await test.moveTimeForward(TWENTY_FIVE_HOUR_TIMELOCK.toNumber() / 2);

    // Guardian revokes pending timelock
    await manager.revokePendingTimelock({
      user: greg, // greg is guardian
    });

    // Verify timelock state after revoke
    const config = await manager.managerVaultConfigAcc.get_data();
    assert.equal(config.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber()); // Original 2 day timelock
    assert.equal(config.pendingTimelock.value.toNumber(), 0);
    assert.equal(config.pendingTimelock.validAt.toNumber(), 0);
  });


  it("owner can revoke pending timelock decrease", async () => {

    // Submit increased timelock as owner
    await manager.submitTimelock({
      user: owen,
      newTimelock: TWENTY_FIVE_HOUR_TIMELOCK,
    });

    // Submit decreased timelock as owner
    await manager.submitTimelock({
      user: owen,
      newTimelock: ONE_DAY_TIMELOCK,
    });

    // Move time forward but not past timelock
    await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() / 2);

    // Owner revokes pending timelock
    await manager.revokePendingTimelock({
      user: owen, // owen is owner
    });

    // Verify timelock state after revoke
    const config = await manager.managerVaultConfigAcc.get_data();
    assert.equal(config.timelock.toNumber(), TWENTY_FIVE_HOUR_TIMELOCK.toNumber()); // Original timelock
    assert.equal(config.pendingTimelock.value.toNumber(), 0);
    assert.equal(config.pendingTimelock.validAt.toNumber(), 0);
  });

  it("guardian can revoke pending cap increase", async () => {
    // Submit increased cap as owner
    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(1000),
    });


    // Move time forward but not past timelock
    await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() / 2);

    // Guardian revokes pending cap
    await manager.revokePendingCap({
      user: greg, // greg is guardian
      marketId: market.marketAcc.key,
    });

    // Verify market config state after revoke
    const marketConfig = await manager.get_market_config(market.marketAcc.key).get_data();
    assert.equal(marketConfig.cap.toNumber(), 0); // Original cap
    assert.equal(marketConfig.enabled, false);
    assert.equal(marketConfig.removableAt.toNumber(), 0);
  });

  it("guardian can revoke pending guardian", async () => {
    // Submit new guardian as owner
    await manager.submitGuardian({
      user: owen, // owen is owner
      newGuardian: garry,
    });

    // Verify config state after submit
    const configAfterSubmit = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configAfterSubmit.guardian.toBase58(), greg.key.publicKey.toBase58()); // Original guardian
    assert.equal(configAfterSubmit.pendingGuardian.value.toBase58(), garry.key.publicKey.toBase58()); // New pending guardian
    assert.equal(configAfterSubmit.pendingGuardian.validAt.toNumber(), await test.getTime() + ONE_DAY_TIMELOCK.toNumber());

    // Move time forward but not past timelock
    await test.moveTimeForward(ONE_DAY_TIMELOCK.toNumber() / 2);

    // Current guardian revokes pending guardian
    await manager.revokePendingGuardian({
      user: greg, // greg is current guardian
    });

    // Verify config state after revoke
    const config = await manager.managerVaultConfigAcc.get_data();
    assert.equal(config.guardian.toBase58(), greg.key.publicKey.toBase58()); // Original guardian
    assert.equal(config.pendingGuardian.value.toBase58(), PublicKey.default.toBase58());
    assert.equal(config.pendingGuardian.validAt.toNumber(), 0);
  });
});
