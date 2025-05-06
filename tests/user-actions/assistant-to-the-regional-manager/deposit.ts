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
    const depositAmount = new anchor.BN(100 * 1e9);

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
    assert.equal(await dan.get_quo_balance(), 999_900 * 1e9);

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
    // const depositAmount = new anchor.BN(150_000 * 1e9);

    // await manager.deposit({
    //   user: dan,
    //   receiver: dan,
    //   markets: [market, metaMarket],
    //   assets: depositAmount,
    // });
    // return;

    // // shared vault balance should be 100
    // assert.equal(Number(await market.quoteAta.getTokenBalance()), depositAmount.toNumber());
    // assert.equal(Number(await metaMarket.quoteAta.getTokenBalance()), depositAmount.toNumber());

    // // Dan's balance should be reduced by deposit amount
    // assert.equal(await dan.get_quo_balance(), 900 * 1e9);

    // // Verify last_total_assets was updated in config
    // const configData = await manager.managerVaultConfigAcc.get_data();
    // assert.equal(configData.lastTotalAssets.toNumber(), depositAmount.toNumber());

    // // manager vault owns shares in base market
    // const postManagerVaultData = await market
    //   .get_lender_shares(manager.managerVaultConfigAcc.key)
    //   .get_data();
    // assert.equal(postManagerVaultData.shares.toNumber(), depositAmount.toNumber());

    // // manager vault doesn't own shares in meta market
    // const postManagerVaultDataMeta = await metaMarket
    //   .get_lender_shares(manager.managerVaultConfigAcc.key)
    //   .get_data();
    // assert.equal(postManagerVaultDataMeta, undefined);
  });

  it("successfully deposits accross all 6 markets", async () => {
  });

  it("reverts when deposit exceeds supply cap", async () => {
  });

  it("reverts when remaining accounts exceeds withdraw queeu", async () => {
  });

});
