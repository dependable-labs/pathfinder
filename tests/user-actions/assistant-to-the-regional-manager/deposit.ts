import * as anchor from "@coral-xyz/anchor";
import { deriveSupplyShares, ONE_DAY_TIMELOCK, TestUtils } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import { AssistantToTheRegionalManager } from "../../../target/types/assistant_to_the_regional_manager";
import assert from "assert";
import { Keypair } from "@solana/web3.js";

describe("deposit", () => {
  let test: TestUtils;
  let manager: ManagerFixture;
  let owen: UserFixture;
  let dan: UserFixture;
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

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9,
      feeRecipient: futarchy,
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

    // initialize and create a market config
    manager = await test.initManagerFixture([market, metaMarket]); 

    await manager.create({
      user: owen,
      symbol: "USDCM",
      name: "USDC Manager",
    });

    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    });

    await manager.submitCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    });

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    await manager.acceptCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
    });
  
    // Create supply queue with two markets
    const supplyQueue = [
      market.marketAcc.key, // Using first market from fixture
      metaMarket.marketAcc.key,
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

    // initial balances
    assert.equal(await dan.get_quo_balance(), 1_000_000 * 1e9); 
    assert.equal(Number(await market.quoteAta.getTokenBalance()), 0);
    assert.equal(Number(await metaMarket.quoteAta.getTokenBalance()), 0);
  });

  it("successfully deposits", async () => {
    const depositAmount = new anchor.BN(1_000 * 1e9);

    await manager.deposit({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket],
      assets: depositAmount,
    });

    // shared vault balance should be 100
    assert.equal(Number(await market.quoteAta.getTokenBalance()), depositAmount.toNumber());
    assert.equal(Number(await metaMarket.quoteAta.getTokenBalance()), depositAmount.toNumber());

    // Dan's balance should be reduced by deposit amount
    assert.equal(await dan.get_quo_balance(), 999_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), depositAmount.toNumber());

    // manager vault owns shares in base market
    const postManagerVaultData = await market
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultData.shares.toNumber(), depositAmount.toNumber());

    // manager vault doesn't own shares in meta market
    const postManagerVaultDataMeta = await metaMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataMeta, undefined);
  }); 

  it("successfully deposits accross two markets", async () => {
    const depositAmount = new anchor.BN(150_000 * 1e9);

    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket],
      assets: depositAmount,
      customCU: 1_000_000,
    });

    // shared vault balance should be 100
    assert.equal(Number(await market.quoteAta.getTokenBalance()), depositAmount.toNumber());
    assert.equal(Number(await metaMarket.quoteAta.getTokenBalance()), depositAmount.toNumber());

    // Dan's balance should be reduced by deposit amount
    assert.equal(Number(await dan.get_quo_balance()), 850_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), depositAmount.toNumber());

    // manager vault owns shares in base market
    const postManagerVaultData = await market
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultData.shares.toNumber(), 100_000 * 1e9);

    const postManagerVaultDataMeta = await metaMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataMeta.shares.toNumber(), 50_000 * 1e9);
  });

  it("successfully deposits accross six markets", async () => {

    let marketConfigs = [
    {
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
    }]
    
    const {
      solMarket,
      wbtcMarket,
      pepeMarket,
      dogeMarket,
    } = await test.createMarkets(marketConfigs);

    // initialize and create a market config
    manager = await test.initManagerFixture([
      market,
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
      marketId: market.marketAcc.key,
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
      marketId: market.marketAcc.key,
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
      market.marketAcc.key,
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

    // deposit 601_000 accross all 6 markets
    let depositAmount = new anchor.BN(601_000 * 1e9);

    // should reject because deposit amount exceeds summed supply caps
    await assert.rejects(
      async () => {
        await manager.depositCustomCU({
          user: dan,
          receiver: dan,
          markets: [market, metaMarket, solMarket, wbtcMarket, pepeMarket, dogeMarket],
          assets: depositAmount,
          customCU: 1_000_000,
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, "GenericFailure");
        return true;
      }
    );

    // should succeed because deposit amount is within summed supply caps
    depositAmount = new anchor.BN(550_000 * 1e9);

    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket, solMarket, wbtcMarket, pepeMarket, dogeMarket],
      assets: depositAmount,
      customCU: 1_000_000,
    });

    // shared vault balance should be 100
    assert.equal(Number(await market.quoteAta.getTokenBalance()), depositAmount.toNumber());
    assert.equal(Number(await metaMarket.quoteAta.getTokenBalance()), depositAmount.toNumber());

    // Dan's balance should be reduced by deposit amount
    assert.equal(Number(await dan.get_quo_balance()), 450_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), depositAmount.toNumber());

    // manager vault owns shares in base market
    const postManagerVaultData = await market
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultData.shares.toNumber(), 100_000 * 1e9);

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

  it("successfully deposits accross six markets with fee and existing deposits", async () => {

    // Should test worst case for computational units:
    // Existing deposits in 6 markets
    // fee calcualtions are required because of fee
    // deposit accross all 6 markets happens successfully
    // TODO: add fee

    let marketConfigs = [
    {
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
    }]
    
    const {
      solMarket,
      wbtcMarket,
      pepeMarket,
      dogeMarket,
    } = await test.createMarkets(marketConfigs);

    // initialize and create a market config
    manager = await test.initManagerFixture([
      market,
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
      marketId: market.marketAcc.key,
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
      marketId: market.marketAcc.key,
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
      market.marketAcc.key,
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

    // should succeed because deposit amount is within summed supply caps
    let depositAmount = new anchor.BN(550_000 * 1e9);

    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket, solMarket, wbtcMarket, pepeMarket, dogeMarket],
      assets: depositAmount,
      customCU: 1_000_000,
    });

    // shared vault balance should be 100
    assert.equal(Number(await market.quoteAta.getTokenBalance()), depositAmount.toNumber());
    assert.equal(Number(await metaMarket.quoteAta.getTokenBalance()), depositAmount.toNumber());

    // Dan's balance should be reduced by deposit amount
    assert.equal(Number(await dan.get_quo_balance()), 450_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), depositAmount.toNumber());

    // manager vault owns shares in base market
    const postManagerVaultData = await market
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultData.shares.toNumber(), 100_000 * 1e9);

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

    // pass 1 day + 1hr for interest accrual
    await test.moveTimeForward(60 * 60 * 25);

    // should succeed because deposit amount is within summed supply caps
    depositAmount = new anchor.BN(10_000 * 1e9);

    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket, solMarket, wbtcMarket, pepeMarket, dogeMarket],
      assets: depositAmount,
      customCU: 1_000_000,
    });

    // shared vault balance should be 100
    assert.equal(Number(await market.quoteAta.getTokenBalance()), 560_000 * 1e9);

    // Dan's balance should be reduced by deposit amount
    assert.equal(Number(await dan.get_quo_balance()), 440_000 * 1e9);

    // manager vault owns shares in base market
    assert.equal(
      (await market.get_lender_shares(manager.managerVaultConfigAcc.key).get_data()).shares.toNumber(),
      100_000 * 1e9
    );

    assert.equal(
      (await metaMarket.get_lender_shares(manager.managerVaultConfigAcc.key).get_data()).shares.toNumber(),
      100_000 * 1e9
    );

    assert.equal(
      (await solMarket.get_lender_shares(manager.managerVaultConfigAcc.key).get_data()).shares.toNumber(),
      100_000 * 1e9
    );

    assert.equal(
      (await wbtcMarket.get_lender_shares(manager.managerVaultConfigAcc.key).get_data()).shares.toNumber(),
      100_000 * 1e9
    );

    assert.equal(
      (await pepeMarket.get_lender_shares(manager.managerVaultConfigAcc.key).get_data()).shares.toNumber(),
      100_000 * 1e9
    );

    assert.equal(
      (await dogeMarket.get_lender_shares(manager.managerVaultConfigAcc.key).get_data()).shares.toNumber(),
      60000000000000
    );

    // Verify fee recipient shares were created correctly
    const feeRecipientShares = await manager.get_supply_shares(manager.feeRecipient.key.publicKey).get_data();
    assert.equal(feeRecipientShares.shares.toNumber(), 0 * 1e9);

    // Verify dans shares were created correctly
    const danShares = await manager.get_supply_shares(dan.key.publicKey).get_data();
    assert.equal(danShares.shares.toNumber(), 550_000 * 1e9);

  });

  it("reverts when remaining accounts exceeds withdraw queue", async () => {
    // create one more market
    const wbtcMarket = await test.createMarket({
      symbol: "WBTC",
      ltvFactor: new anchor.BN(0),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    // initialize and create a market config
    manager = await test.initManagerFixture([
      market,
      metaMarket,
      wbtcMarket,
    ]);

    await manager.create({
      user: owen,
      symbol: "USDCMEDIUM",
      name: "USDC Manager Medium",
    });

    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    });
    await manager.submitCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    });
    await manager.submitCap({
      user: owen,
      marketId: wbtcMarket.marketAcc.key,
      supplyCap: new anchor.BN(100_000 * 1e9),
    });

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(60 * 60 * 25);

    await manager.acceptCap({
      user: owen,
      marketId: market.marketAcc.key,
    });

    await manager.acceptCap({
      user: owen,
      marketId: metaMarket.marketAcc.key,
    });

    await manager.acceptCap({
      user: owen,
      marketId: wbtcMarket.marketAcc.key,
    });

    // Create supply queue with threemarkets
    const supplyQueue = [
      market.marketAcc.key,
      metaMarket.marketAcc.key,
      wbtcMarket.marketAcc.key,
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

    await manager.submitCap({
      user: owen,
      marketId: market.marketAcc.key,
      supplyCap: new anchor.BN(0 * 1e9),
    });

    // remove one from withdraw queue
    await manager.removeFromWithdrawQueue({
      user: owen,
      marketId: market.marketAcc.key,
    });

    // Verify queue differences
    const withdrawQueueAccountAfterRemove= await manager.queue.getWithdrawQueue();
    assert.deepEqual(withdrawQueueAccountAfterRemove, [
      metaMarket.marketAcc.key,
      wbtcMarket.marketAcc.key,
    ]);

    const supplyQueueAccountAfterRemove= await manager.queue.getSupplyQueue();
    assert.deepEqual(supplyQueueAccountAfterRemove, supplyQueue);

    let depositAmount = new anchor.BN(100_000 * 1e9);

    // fails with market not in queue error
    await assert.rejects(
      async () => {
        await manager.depositCustomCU({
          user: dan,
          receiver: dan,
          markets: [market, metaMarket, wbtcMarket],
          assets: depositAmount,
          customCU: 1_000_000,
        });
      },
      (err: anchor.AnchorError) => {
        // fails with market not in queue error
        assert.strictEqual(err.code, "GenericFailure");
        return true;
      }
    );

    // fails with duplicate markets at front of remaining accounts
    await assert.rejects(
      async () => {
        await manager.depositCustomCU({
          user: dan,
          receiver: dan,
          markets: [metaMarket, metaMarket, wbtcMarket],
          assets: depositAmount,
          customCU: 1_000_000,
        });
      },
      (err: anchor.AnchorError) => {
        // invalid supply queue account
        assert.strictEqual(err.code, "GenericFailure");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await manager.depositCustomCU({
          user: dan,
          receiver: dan,
          markets: [metaMarket, wbtcMarket],
          assets: depositAmount,
          customCU: 1_000_000,
        });
      },
      (err: anchor.AnchorError) => {
        // invalid supply queue account -> because markets are not in supply queue order
        assert.strictEqual(err.code, "GenericFailure");
        return true;
      }
    );

    // set new supply queue
    await manager.setSupplyQueue({
      user: owen,
      marketIds: [metaMarket.marketAcc.key, wbtcMarket.marketAcc.key],
    });

    // Verify queue was set correctly
    const supplyQueueAccountAfterSet= await manager.queue.getSupplyQueue();
    assert.deepEqual(supplyQueueAccountAfterSet, [
      metaMarket.marketAcc.key,
      wbtcMarket.marketAcc.key,
    ]);

    // Verify queue simularities
    const withdrawQueueAccountAfterSet= await manager.queue.getWithdrawQueue();
    assert.deepEqual(withdrawQueueAccountAfterSet, supplyQueueAccountAfterSet);

    // pass 1 day + 1hr for timelock
    await test.moveTimeForward(1);

    // call deposit (pass two accounts)
    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [metaMarket, wbtcMarket],
      assets: depositAmount,
      customCU: 1_000_000,
    });

    // shared vault balance should be 100
    assert.equal(Number(await market.quoteAta.getTokenBalance()), depositAmount.toNumber());
    assert.equal(Number(await metaMarket.quoteAta.getTokenBalance()), depositAmount.toNumber());

    // Dan's balance should be reduced by deposit amount
    assert.equal(Number(await dan.get_quo_balance()), 900_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), depositAmount.toNumber());

    // manager vault owns shares in base market
    const postManagerVaultDataMeta = await metaMarket
      .get_lender_shares(manager.managerVaultConfigAcc.key)
      .get_data();
    assert.equal(postManagerVaultDataMeta.shares.toNumber(), 100_000 * 1e9);

  });

});
