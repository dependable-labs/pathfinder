import * as anchor from "@coral-xyz/anchor";
import { deriveSupplyShares, ONE_DAY_TIMELOCK, TestUtils } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import { AssistantToTheRegionalManager } from "../../../target/types/assistant_to_the_regional_manager";
import assert from "assert";
import { Keypair, PublicKey } from "@solana/web3.js";

describe("withdraw", () => {
  let test: TestUtils;
  let manager: ManagerFixture;
  let owen: UserFixture;
  let dan: UserFixture;
  let futarchy: UserFixture;
  let withdrawQueue: MarketFixture[];
  let bonkMarket: MarketFixture;
  let metaMarket: MarketFixture;
  let solMarket: MarketFixture;
  let wbtcMarket: MarketFixture;
  let pepeMarket: MarketFixture;
  let dogeMarket: MarketFixture;

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

    futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    await test.initPathfinderProgram({
      payerAndRecipient: owen,
      authority: futarchy,
    });


    let marketConfigs = [
      {
        symbol: "BONK",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        feeRecipient: futarchy,
        authority: futarchy,
      }, {
        symbol: "META",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        feeRecipient: futarchy,
        authority: futarchy,
      }, {
        symbol: "SOL",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        feeRecipient: futarchy,
        authority: futarchy,
      }, {
        symbol: "WBTC",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        feeRecipient: futarchy,
        authority: futarchy,
      }, {
        symbol: "PEPE",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        feeRecipient: futarchy,
        authority: futarchy,
      }, {
        symbol: "DOGE",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        feeRecipient: futarchy,
        authority: futarchy,
    }];
    
    ({
      bonkMarket,
      metaMarket,
      solMarket,
      wbtcMarket,
      pepeMarket,
      dogeMarket,
    } = await test.createMarkets(marketConfigs));

    // initialize and create a market config
    manager = await test.initManagerFixture([
      bonkMarket,
      metaMarket,
      solMarket,
      wbtcMarket,
      pepeMarket,
      dogeMarket,
    ]); 

    await manager.create({
      user: owen,
      symbol: "USDCMBIG",
      name: "USDC Manager Large",
    });

    await manager.submitCap({
      user: owen,
      marketId: bonkMarket.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    });
    await manager.submitCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    });
    await manager.submitCap({
      user: owen,
      marketId: solMarket.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    });
    await manager.submitCap({
      user: owen,
      marketId: wbtcMarket.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    });
    await manager.submitCap({
      user: owen,
      marketId: pepeMarket.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    }); 
    await manager.submitCap({
      user: owen,
      marketId: dogeMarket.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    }); 


    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    await manager.acceptCap({
      user: owen,
      marketId: bonkMarket.marketAcc.key,
    });

    await manager.acceptCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
    });

    await manager.acceptCap({
      user: owen,
      marketId: solMarket.marketAcc.key,
    });

    await manager.acceptCap({
      user: owen,
      marketId: wbtcMarket.marketAcc.key,
    });

    await manager.acceptCap({
      user: owen,
      marketId: pepeMarket.marketAcc.key,
    });
 
    await manager.acceptCap({
      user: owen,
      marketId: dogeMarket.marketAcc.key,
    });
     
    // Create supply queue with two markets
    const supplyQueue = [
      bonkMarket.marketAcc.key,
      metaMarket.marketAcc.key,
      solMarket.marketAcc.key,
      wbtcMarket.marketAcc.key,
      pepeMarket.marketAcc.key,
      dogeMarket.marketAcc.key,
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

    withdrawQueue = [
      bonkMarket,
      metaMarket,
      solMarket,
      wbtcMarket,
      pepeMarket,
      dogeMarket,
    ];

    // should succeed because deposit amount is within summed supply caps
    let depositAmount = new anchor.BN(550_000 * 1e9);

    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [bonkMarket, metaMarket, solMarket, wbtcMarket, pepeMarket, dogeMarket],
      assets: depositAmount,
      customCU: 1_000_000,
    });

    // manager vault owns shares in base market
    const bonkTotalDeposits = await bonkMarket.marketAcc.getTotalDeposits();
    assert.equal(bonkTotalDeposits.toNumber(), 100_000 * 1e9);

    // Dan's initial balance
    const priorDanBalance = await dan.get_quo_balance();
    assert.equal(Number(priorDanBalance), 450_000 * 1e9);

    // manager vault balance
    const priorManagerVaultBalance = await manager.get_supply_shares(dan.key.publicKey).get_data();
    assert.equal(Number(priorManagerVaultBalance.shares), 550_000 * 1e9);

    // shared vault quote ata balance
    assert.equal(Number(await bonkMarket.quoteAta.getTokenBalance()), 550_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), 550_000 * 1e9);

    // manager vault owns shares in base market
    const postManagerVaultDataBonk = await bonkMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataBonk.shares.toNumber(), 100_000 * 1e9);

    const bonkMarketAcc = await bonkMarket.marketAcc.get_data();
    assert.equal(bonkMarketAcc.totalShares.toNumber(), 100_000 * 1e9);
    assert.equal(bonkMarketAcc.totalBorrowShares.toNumber(), 0);

    const postManagerVaultDataMeta = await metaMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataMeta.shares.toNumber(), 100_000 * 1e9);

    const postManagerVaultDataSol = await solMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataSol.shares.toNumber(), 100_000 * 1e9);

    const postManagerVaultDataWbtc = await wbtcMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataWbtc.shares.toNumber(), 100_000 * 1e9);

    const postManagerVaultDataPepe = await pepeMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataPepe.shares.toNumber(), 100_000 * 1e9);

    const postManagerVaultDataDoge = await dogeMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataDoge.shares.toNumber(), 50_000 * 1e9);

  });

  it("successfully withdraws", async () => {
    const withdrawAmount = new anchor.BN(1_000 * 1e9);

    await assert.rejects(
      manager.withdrawCustomCU({
        user: dan,
        recipient: dan,
        withdrawQueueIndex: 0,
        markets: [bonkMarket, metaMarket], // Missing markets from withdraw queue
        assets: withdrawAmount,
        customCU: 1_000_000,
      }),
      (err: any) => {
        assert.strictEqual(err.code, "GenericFailure");
        return true;
      }
    );

    await manager.withdrawCustomCU({
      user: dan,
      recipient: dan,
      withdrawQueueIndex: 0,
      markets: [bonkMarket, metaMarket, solMarket, wbtcMarket, pepeMarket, dogeMarket],
      assets: withdrawAmount,
      customCU: 1_000_000,
    });

    // shared vault balance should be 100
    assert.equal(Number(await bonkMarket.quoteAta.getTokenBalance()), 549_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), 549000.000000000 * 1e9);

    // manager vault owns shares in base market
    const postManagerVaultData = await bonkMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultData.shares.toNumber(), 99000.000000000 * 1e9);

    // Dan's balance should be increasedby withdraw amount
    const postDanBalance = await dan.get_quo_balance();
    assert.equal(Number(postDanBalance), 451_000 * 1e9);

  }); 

  it("successfully withdraws accross two markets", async () => {
    let withdrawAmount = new anchor.BN(100_000 * 1e9);

    await manager.withdrawCustomCU({
      user: dan,
      recipient: dan,
      withdrawQueueIndex: 0,
      markets: withdrawQueue,
      assets: withdrawAmount,
      customCU: 1_000_000,
    });

    withdrawAmount = new anchor.BN(50_000 * 1e9);

    await manager.withdrawCustomCU({
      user: dan,
      recipient: dan,
      withdrawQueueIndex: 1,
      markets: withdrawQueue,
      assets: withdrawAmount,
      customCU: 1_000_000,
    });

    // shared vault balance should be 100
    assert.equal(Number(await bonkMarket.quoteAta.getTokenBalance()), 400_000.000000000 * 1e9);

    // Dan's balance should be increased by withdraw amount
    assert.equal(Number(await dan.get_quo_balance()), 450_000 * 1e9 + 150_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), 400_000.000000000* 1e9);

    // manager vault's shares in base market
    const postManagerVaultData = await bonkMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultData.shares.toNumber(), 0);
    // assert.equal(postManagerVaultData.shares.toNumber(), 2.853840547 * 1e9);

    const postManagerVaultDataMeta = await metaMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataMeta.shares.toNumber(), 50_000.000000000 * 1e9);

    const postManagerVaultDataSol = await solMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataSol.shares.toNumber(), 100_000 * 1e9);
  });

  it("successfully withdraws accross six markets", async () => {
    let withdrawAmount = new anchor.BN(101_000 * 1e9);
    // should reject because deposit amount exceeds summed supply caps

    await assert.rejects(
      async () => {
        await manager.withdrawCustomCU({
          user: dan,
          recipient: dan,
          withdrawQueueIndex: 0,
          markets: withdrawQueue,
          assets: withdrawAmount,
          customCU: 1_000_000,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.code, "GenericFailure");
        return true;
      }
    );

    for (let i = 0; i < 5; i++) {

      await manager.withdrawCustomCU({
        user: dan,
        recipient: dan,
        withdrawQueueIndex: i,
        markets: withdrawQueue,
        assets: new anchor.BN(100_000 * 1e9),
        customCU: 1_000_000,
      });
    }

    await manager.withdrawCustomCU({
      user: dan,
      recipient: dan,
      withdrawQueueIndex: 5,
      markets: withdrawQueue,
      assets: new anchor.BN(50_000 * 1e9),
      customCU: 1_000_000,
    });

    // shared vault balance should be 100
    assert.equal(Number(await bonkMarket.quoteAta.getTokenBalance()), 0);

    // Dan's balance should be increased by withdraw amount
    assert.equal(Number(await dan.get_quo_balance()), 1_000_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), 0);

    // manager vault owns shares in base market
    const postManagerVaultData = await bonkMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultData.shares.toNumber(), 0);

    const postManagerVaultDataMeta = await metaMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataMeta.shares.toNumber(), 0);

    const postManagerVaultDataSol = await solMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataSol.shares.toNumber(), 0);

    const postManagerVaultDataWbtc = await wbtcMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataWbtc.shares.toNumber(), 0);

    const postManagerVaultDataPepe = await pepeMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataPepe.shares.toNumber(), 0);

    const postManagerVaultDataDoge = await dogeMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataDoge.shares.toNumber(), 0);
  });

  it("reverts when remaining accounts don't matchwithdraw queue", async () => {
    // fails with market not in queue error
    await assert.rejects(
      async () => {
        await manager.withdrawCustomCU({
          user: dan,
          recipient: dan,
          withdrawQueueIndex: 0,
          markets: [bonkMarket, metaMarket, solMarket],
          assets: new anchor.BN(100_000 * 1e9),
          customCU: 1_000_000,
        });
      },
      (err: any) => {
        // fails with market not in queue error
        console.log("err", err);
        assert.strictEqual(err.code, "GenericFailure");
        return true;
      }
    );

    // fails with duplicate markets at front of remaining accounts
    await assert.rejects(
      async () => {
        await manager.withdrawCustomCU({
          user: dan,
          recipient: dan,
          withdrawQueueIndex: 0,
          markets: [metaMarket, metaMarket, wbtcMarket],
          assets: new anchor.BN(100_000 * 1e9),
          customCU: 1_000_000,
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, "GenericFailure");
        return true;
      }
    );

    // invalid withdraw queue -> because markets are not in withdraw queue order
    await assert.rejects(
      async () => {
        await manager.withdrawCustomCU({
          user: dan,
          recipient: dan,
          withdrawQueueIndex: 0,
          markets: [metaMarket, bonkMarket, solMarket, wbtcMarket, pepeMarket, dogeMarket],
          assets: new anchor.BN(100_000 * 1e9),
          customCU: 1_000_000,
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, "GenericFailure");
        return true;
      }
    );
  });
});
