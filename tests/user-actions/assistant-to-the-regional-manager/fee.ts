import * as anchor from "@coral-xyz/anchor";
import { ONE_DAY_TIMELOCK, TestUtils } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import { AssistantToTheRegionalManager } from "../../../target/types/assistant_to_the_regional_manager";
import assert from "assert";
import { Keypair } from "@solana/web3.js";

describe("set_fee", () => {
  let test: TestUtils;
  let manager: ManagerFixture;
  let owen: UserFixture;
  let bob: UserFixture;
  let fred: UserFixture;
  let futarchy: UserFixture;
  let market: MarketFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
    });

    owen = await test.createUser(
      new anchor.BN(100_000 * 1e9),
      new anchor.BN(0)
    );

    bob = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(1_000 * 1e9)
    );

    fred = await test.createUser(
      new anchor.BN(100_000 * 1e9),
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
      ltvFactor: new anchor.BN(0.8 * 1e9),
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
    const supplyQueueAccount = await manager.queue.getSupplyQueue();
    assert.deepEqual(supplyQueueAccount, supplyQueue);

    // Verify queue was set correctly
    const withdrawQueueAccount= await manager.queue.getWithdrawQueue();
    assert.deepEqual(withdrawQueueAccount, supplyQueue);

  });

  it("successfully sets fee", async () => {
    await manager.setFee({
      user: owen,
      fee: new anchor.BN(10),
      markets: [market],
    });

    const managerVaultData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(managerVaultData.fee.toNumber(), 10);

    await manager.depositCustomCU({
      user: owen,
      receiver: owen,
      markets: [market],
      assets: new anchor.BN(50_000 * 1e9),
      customCU: 1_000_000,
    });

    // bob borrows
    await market.depositCollateral({
      user: bob,
      owner: bob,
      amount: new anchor.BN(1_000 * 1e9),
    });

    await market.collateral.setPrice({
      price: new anchor.BN(1_000 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
    });

    await market.borrow({
      user: bob,
      owner: bob,
      recipient: bob,
      shares: new anchor.BN(0),
      amount: new anchor.BN(10_000 * 1e9),
    });

    // time passes (1 year)
    await test.moveTimeForward(60 * 60 * 24 * 365);

    // bob repays
    await market.repay({
      user: bob,
      owner: bob,
      amount: new anchor.BN(0),
      shares: new anchor.BN(10_000 * 1e9),
    });

    const bobBorrowerShares = await market.get_borrower_shares(bob.key.publicKey).get_data();
    assert.equal(bobBorrowerShares.borrowShares.toNumber(), 0);

    await manager.depositCustomCU({
      user: owen,
      receiver: owen,
      markets: [market],
      assets: new anchor.BN(10_000 * 1e9),
      customCU: 1_000_000,
    });

    const owenSupplyShares = await manager.get_supply_shares(owen.key.publicKey).get_data();
    assert.equal(owenSupplyShares.shares.toNumber(), 50_000 * 1e9);

    const feeRecipientSupplyShares = await manager.get_supply_shares(manager.feeRecipient.key.publicKey).get_data();
    assert.equal(feeRecipientSupplyShares.shares.toNumber(), 50_000 * 1e9);
    
  });

  it("fails to set fee if not owner", async () => {
    await assert.rejects(
      async () => {
        await manager.setFee({
          user: futarchy,
          fee: new anchor.BN(10),
          markets: [market],
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Unauthorized signer");
        return true;
      }
    );
  });

  it("successfully sets new fee recipient", async () => {

    const config = await manager.managerVaultConfigAcc.get_data();
    assert.equal(config.feeRecipient.toBase58(), owen.key.publicKey.toBase58());

    await manager.setFeeRecipient({
      user: owen,
      new_fee_recipient: fred,
      markets: [market]
    })

    const postConfig = await manager.managerVaultConfigAcc.get_data();
    assert.equal(postConfig.feeRecipient.toBase58(), fred.key.publicKey.toBase58());

  });

});