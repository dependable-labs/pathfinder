import * as anchor from "@coral-xyz/anchor";
import { deriveSupplyShares, ONE_DAY_TIMELOCK, TestUtils } from "../../utils";
import { ManagerFixture, MarketFixture, UserFixture } from "../../fixtures";
import { AssistantToTheRegionalManager } from "../../../target/types/assistant_to_the_regional_manager";
import assert from "assert";
import { Keypair } from "@solana/web3.js";

describe("reallocate", () => {
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
    const withdrawQueueAccount = await manager.queue.getWithdrawQueue();
    assert.deepEqual(withdrawQueueAccount, supplyQueue);

    // initial balances
    assert.equal(await dan.get_quo_balance(), 1_000_000 * 1e9);
    assert.equal(Number(await market.quoteAta.getTokenBalance()), 0);
    assert.equal(Number(await metaMarket.quoteAta.getTokenBalance()), 0);
  });

  it("successfully reallocates funds to a single market", async () => {
    // deposit into both markets
    // should succeed because deposit amount is within summed supply caps
    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket],
      assets: new anchor.BN(120_000 * 1e9),
      customCU: 1_000_000,
    });

    // verify shared vault balance
    assert.equal(Number(await market.quoteAta.getTokenBalance()), new anchor.BN(120_000 * 1e9).toNumber());

    // verify total deposit in market account
    const marketDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(Number(marketDeposits), new anchor.BN(100_000 * 1e9).toNumber());

    // verify total deposit in metaMarket account
    const metaMarketDeposits = await metaMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(metaMarketDeposits), new anchor.BN(20_000 * 1e9).toNumber());

    // reallocate
    await manager.reallocate({
      user: owen,
      withdrawAmount: new anchor.BN(30_000 * 1e9),
      withdrawMarket: market,
      supplyMarkets: [metaMarket],
      supplyAmounts: [new anchor.BN(30_000 * 1e9)],
      customCU: 300_000,
    });

    // verify total deposit in market account
    const marketDeposits2 = await market.marketAcc.getTotalDeposits();
    assert.equal(Number(marketDeposits2), new anchor.BN(70_000 * 1e9).toNumber());

    // verify total deposit in metaMarket account
    const metaMarketDeposits2 = await metaMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(metaMarketDeposits2), new anchor.BN(50_000 * 1e9).toNumber());
  });

  it("fails to reallocate when withdrawAmount doesn't match supplyAmounts", async () => {
    // deposit into both markets
    // should succeed because deposit amount is within summed supply caps
    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket],
      assets: new anchor.BN(120_000 * 1e9),
      customCU: 1_000_000,
    });

    // verify shared vault balance
    assert.equal(Number(await market.quoteAta.getTokenBalance()), new anchor.BN(120_000 * 1e9).toNumber());

    // verify total deposit in market account
    const marketDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(Number(marketDeposits), new anchor.BN(100_000 * 1e9).toNumber());

    // verify total deposit in metaMarket account
    const metaMarketDeposits = await metaMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(metaMarketDeposits), new anchor.BN(20_000 * 1e9).toNumber());


    // should fail when withdrawAmount exceeds supplyAmounts
    await assert.rejects(
      async () => {
        // reallocate
        await manager.reallocate({
          user: owen,
          withdrawAmount: new anchor.BN(30_000 * 1e9),
          withdrawMarket: market,
          supplyMarkets: [metaMarket],
          supplyAmounts: [new anchor.BN(10_000 * 1e9)],
          customCU: 300_000,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.code, "GenericFailure")
        return true;
      }
    );  

    // should fail when supplyAmounts exceeds withdrawAmount
    await assert.rejects(
      async () => {
        // reallocate
        await manager.reallocate({
          user: owen,
          withdrawAmount: new anchor.BN(25_000 * 1e9),
          withdrawMarket: market,
          supplyMarkets: [metaMarket],
          supplyAmounts: [new anchor.BN(30_000 * 1e9)],
          customCU: 300_000,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.code, "GenericFailure")
        return true;
      }
    ); 
  });

  it("fails to reallocate when supplyAmounts exceeds supplyCap", async () => {
    // deposit into both markets
    // should succeed because deposit amount is within summed supply caps
    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket],
      assets: new anchor.BN(120_000 * 1e9),
      customCU: 1_000_000,
    });

    // verify shared vault balance
    assert.equal(Number(await market.quoteAta.getTokenBalance()), new anchor.BN(120_000 * 1e9).toNumber());

    // verify total deposit in market account
    const marketDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(Number(marketDeposits), new anchor.BN(100_000 * 1e9).toNumber());

    // verify total deposit in metaMarket account
    const metaMarketDeposits = await metaMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(metaMarketDeposits), new anchor.BN(20_000 * 1e9).toNumber());

    // should fail when withdrawAmount exceeds supplyAmounts
    await assert.rejects(
      async () => {
        // reallocate
        await manager.reallocate({
          user: owen,
          withdrawAmount: new anchor.BN(99_000 * 1e9),
          withdrawMarket: market,
          supplyMarkets: [metaMarket],
          supplyAmounts: [new anchor.BN(99_000 * 1e9)],
          customCU: 300_000,
        });
      },
      (err: anchor.AnchorError) => {
        // supply cap exceeded error
        assert.strictEqual(err.code, "GenericFailure")
        return true;
      }
    );
  });

  it("successfully reallocates when market is not in supply queue", async () => {

    let marketConfigs = [
      {
        user: futarchy,
        symbol: "SOL",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        authority: futarchy,
      }, {
        user: futarchy,
        symbol: "WBTC",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        authority: futarchy,
      }]

    const {
      solMarket,
      wbtcMarket,
    } = await test.createMarkets(marketConfigs);

    // initialize and create a market config
    manager = await test.initManagerFixture([
      market,
      metaMarket,
      solMarket,
      wbtcMarket,
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


    // Create supply queue
    const supplyQueue = [
      market.marketAcc.key,
      metaMarket.marketAcc.key,
      solMarket.marketAcc.key
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
    const withdrawQueueAccount = await manager.queue.getWithdrawQueue();
    assert.deepEqual(withdrawQueueAccount, [...supplyQueue, wbtcMarket.marketAcc.key]);

    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket, solMarket, wbtcMarket],
      assets: new anchor.BN(100_000 * 1e9),
      customCU: 1_000_000,
    });

    // verify shared vault balance
    assert.equal(Number(await market.quoteAta.getTokenBalance()), new anchor.BN(100_000 * 1e9).toNumber());

    // verify total deposit in market account
    const marketDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(Number(marketDeposits), new anchor.BN(100_000 * 1e9).toNumber());

    // verify total deposit in metaMarket account
    const metaMarketDeposits = await metaMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(metaMarketDeposits), new anchor.BN(0).toNumber());

    await manager.reallocate({
      user: owen,
      withdrawAmount: new anchor.BN(30_000 * 1e9),
      withdrawMarket: market,
      supplyMarkets: [metaMarket, solMarket, wbtcMarket],
      supplyAmounts: [
        new anchor.BN(10_000 * 1e9),
        new anchor.BN(10_000 * 1e9),
        new anchor.BN(10_000 * 1e9),
      ],
      customCU: 700_000,
    });

    const postRealMarketDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(Number(postRealMarketDeposits), new anchor.BN(70_000 * 1e9).toNumber());

    // verify total deposit in metaMarket account
    const postRealocateMetaMarketDeposits = await metaMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(postRealocateMetaMarketDeposits), new anchor.BN(10_000 * 1e9).toNumber());

    // verify total deposit in solMarket account
    const postRealocateSolMarketDeposits = await solMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(postRealocateSolMarketDeposits), new anchor.BN(10_000 * 1e9).toNumber());

    // verify total deposit in wbtcMarket account
    const postRealocateWbtcMarketDeposits = await wbtcMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(postRealocateWbtcMarketDeposits), new anchor.BN(10_000 * 1e9).toNumber());
  });

  it("fails to reallocate when market has zero cap", async () => {

    let marketConfigs = [
      {
        user: futarchy,
        symbol: "SOL",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        authority: futarchy,
      }, {
        user: futarchy,
        symbol: "WBTC",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        authority: futarchy,
      }]

    const {
      solMarket,
      wbtcMarket,
    } = await test.createMarkets(marketConfigs);

    // initialize and create a market config
    manager = await test.initManagerFixture([
      market,
      metaMarket,
      solMarket,
      wbtcMarket,
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


    // Create supply queue
    const supplyQueue = [
      market.marketAcc.key,
      metaMarket.marketAcc.key,
      solMarket.marketAcc.key,
      wbtcMarket.marketAcc.key
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
    const withdrawQueueAccount = await manager.queue.getWithdrawQueue();
    assert.deepEqual(withdrawQueueAccount, supplyQueue);

    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket, solMarket, wbtcMarket],
      assets: new anchor.BN(100_000 * 1e9),
      customCU: 1_000_000,
    });

    // verify shared vault balance
    assert.equal(Number(await market.quoteAta.getTokenBalance()), new anchor.BN(100_000 * 1e9).toNumber());

    // verify total deposit in market account
    const marketDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(Number(marketDeposits), new anchor.BN(100_000 * 1e9).toNumber());

    // verify total deposit in metaMarket account
    const metaMarketDeposits = await metaMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(metaMarketDeposits), new anchor.BN(0).toNumber());

    // submit cap for market with zero cap
    await manager.submitCap({
      user: owen,
      marketId: wbtcMarket.marketAcc.key,
      supplyCap: new anchor.BN(0),
    });

    // verify wbtc market cap is zero
    const wbtcMarketCap = await manager.get_manager_market_config(wbtcMarket.marketAcc.key).get_data();
    assert.equal(Number(wbtcMarketCap.cap), 0);



    await assert.rejects(
      async () => {
        await manager.reallocate({
          user: owen,
          withdrawAmount: new anchor.BN(30_000 * 1e9),
          withdrawMarket: market,
          supplyMarkets: [metaMarket, solMarket, wbtcMarket],
          supplyAmounts: [
            new anchor.BN(10_000 * 1e9),
            new anchor.BN(10_000 * 1e9),
            new anchor.BN(10_000 * 1e9),
          ],
          customCU: 700_000,
        });
      },
      (err: anchor.AnchorError) => {
        // unauthorized market -> cap == 0
        assert.strictEqual(err.code, "GenericFailure")
        return true;
      }
    );

    const postRealMarketDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(Number(postRealMarketDeposits), new anchor.BN(100_000 * 1e9).toNumber());

    // verify total deposit in metaMarket account
    const postRealocateMetaMarketDeposits = await metaMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(postRealocateMetaMarketDeposits), new anchor.BN(0).toNumber());

    // verify total deposit in solMarket account
    const postRealocateSolMarketDeposits = await solMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(postRealocateSolMarketDeposits), new anchor.BN(0).toNumber());

    // verify total deposit in wbtcMarket account
    const postRealocateWbtcMarketDeposits = await wbtcMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(postRealocateWbtcMarketDeposits), new anchor.BN(0).toNumber());
  });

  it("successfully reallocates funds to five markets", async () => {
    // deposit into both markets
    // should succeed because deposit amount is within summed supply caps

    let marketConfigs = [
      {
        user: futarchy,
        symbol: "SOL",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        authority: futarchy,
      }, {
        user: futarchy,
        symbol: "WBTC",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        authority: futarchy,
      }, {
        user: futarchy,
        symbol: "PEPE",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
        authority: futarchy,
      }, {
        user: futarchy,
        symbol: "DOGE",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 1e9),
        conf: new anchor.BN(100 / 10 * 1e9),
        expo: -9,
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
    const withdrawQueueAccount = await manager.queue.getWithdrawQueue();
    assert.deepEqual(withdrawQueueAccount, supplyQueue);


    await manager.depositCustomCU({
      user: dan,
      receiver: dan,
      markets: [market, metaMarket, solMarket, wbtcMarket, pepeMarket, dogeMarket],
      assets: new anchor.BN(100_000 * 1e9),
      customCU: 1_000_000,
    });

    // shared vault balance should be 100
    assert.equal(Number(await market.quoteAta.getTokenBalance()), 100_000 * 1e9);

    // verify total deposit in market account
    const marketDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(Number(marketDeposits), new anchor.BN(100_000 * 1e9).toNumber());

    // verify total deposit in metaMarket account
    const metaMarketDeposits = await metaMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(metaMarketDeposits), new anchor.BN(0).toNumber());

    // should fail when supply amounts array length doesn't match supply markets array length
    await assert.rejects(
      async () => {
        await manager.reallocate({
          user: owen,
          withdrawAmount: new anchor.BN(50_000 * 1e9),
          withdrawMarket: market,
          supplyMarkets: [metaMarket, solMarket, wbtcMarket, pepeMarket, dogeMarket],
          supplyAmounts: [
            new anchor.BN(10_000 * 1e9),
            new anchor.BN(10_000 * 1e9),
            new anchor.BN(10_000 * 1e9),
            new anchor.BN(10_000 * 1e9),
          ],
          customCU: 700_000,
        });
      },
      (err: anchor.AnchorError) => {
        // reallocate account mismatch error
        assert.strictEqual(err.code, "GenericFailure")
        return true;
      }
    );

    // reallocate 10_000 from market across all other markets
    await manager.reallocate({
      user: owen,
      withdrawAmount: new anchor.BN(50_000 * 1e9),
      withdrawMarket: market,
      supplyMarkets: [metaMarket, solMarket, wbtcMarket, pepeMarket, dogeMarket],
      supplyAmounts: [
        new anchor.BN(10_000 * 1e9),
        new anchor.BN(10_000 * 1e9),
        new anchor.BN(10_000 * 1e9),
        new anchor.BN(10_000 * 1e9),
        new anchor.BN(10_000 * 1e9),
      ],
      customCU: 700_000,
    });

    // verify total deposit in market account after reallocation
    const marketDeposits2 = await market.marketAcc.getTotalDeposits();
    assert.equal(Number(marketDeposits2), new anchor.BN(50_000 * 1e9).toNumber());

    // verify total deposit in other market accounts after reallocation
    const metaMarketDeposits2 = await metaMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(metaMarketDeposits2), new anchor.BN(10_000 * 1e9).toNumber());

    const solMarketDeposits = await solMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(solMarketDeposits), new anchor.BN(10_000 * 1e9).toNumber());

    const wbtcMarketDeposits = await wbtcMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(wbtcMarketDeposits), new anchor.BN(10_000 * 1e9).toNumber());

    const pepeMarketDeposits = await pepeMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(pepeMarketDeposits), new anchor.BN(10_000 * 1e9).toNumber());

    const dogeMarketDeposits = await dogeMarket.marketAcc.getTotalDeposits();
    assert.equal(Number(dogeMarketDeposits), new anchor.BN(10_000 * 1e9).toNumber());

    // Dan's balance should be reduced by deposit amount
    assert.equal(Number(await dan.get_quo_balance()), 900_000 * 1e9);

    // Verify last_total_assets was updated in config
    const configData = await manager.managerVaultConfigAcc.get_data();
    assert.equal(configData.lastTotalAssets.toNumber(), 100_000 * 1e9);
  });
});
