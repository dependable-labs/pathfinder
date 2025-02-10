import { TestUtils } from "../utils";
import { MarketFixture, OracleSource, UserFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";

describe("Oracle", () => {
  let test: TestUtils;
  let market: MarketFixture;
  let larry: UserFixture;
  let bob: UserFixture;
  let futarchy: UserFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
      collateralDecimals: 9,
    });

    larry = await test.createUser(
      new anchor.BN(1_000_000 * 1e9),
      new anchor.BN(0)
    );

    bob = await test.createUser(
      new anchor.BN(0), 
      new anchor.BN(1_000_000 * 1e9)
    );

    futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );
  });


  it("switchboard borrow fails collateral can't support debt", async () => {

    // switchboard price is hard data gathered from mainnet
    // 0.000017905 * 1e9 = 17905
    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(10 * 1e9),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
      oracleSource: OracleSource.SwitchboardPull,
    });

    await market.createAndSetAuthority({ user: larry });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1_000 * 1e9),
      shares: new anchor.BN(0),
      owner: larry
    });

    await market.depositCollateral({
      user: bob,
      amount: new anchor.BN(1_000_000 * 1e9),
      owner: bob,
    });


    await assert.rejects(
      async () => {
        await market.borrow({
          user: bob,
          amount: new anchor.BN("1000000000000000"),
          shares: new anchor.BN(0),
          owner: bob,
          recipient: bob,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6011);
        assert.strictEqual(err.error.errorMessage, "User is not solvent"); // wrong err!
        return true;
      }
    );
  });


  it("pyth borrow suceeds", async () => {

    // matching pyth & switchboard price
    // 0.000017905 * 1e9 = 17905
    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(17905),
      conf: new anchor.BN(0),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    await market.createAndSetAuthority({ user: larry });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1_000 * 1e9),
      shares: new anchor.BN(0),
      owner: larry
    });

    await market.depositCollateral({
      user: bob,
      amount: new anchor.BN(1_000_000 * 1e9),
      owner: bob,
    });

    await market.borrow({
      user: bob,
      amount: new anchor.BN(1),
      shares: new anchor.BN(0),
      owner: bob,
      recipient: bob,
    });
  });

  it("switchboard borrow suceeds", async () => {

    // switchboard price is hard data gathered from mainnet
    // 0.000017905 * 1e9 = 17905
    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(10 * 1e9),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
      oracleSource: OracleSource.SwitchboardPull,
    });


    await market.createAndSetAuthority({ user: larry });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1_000 * 1e9),
      shares: new anchor.BN(0),
      owner: larry
    });

    await market.depositCollateral({
      user: bob,
      amount: new anchor.BN(1_000_000 * 1e9),
      owner: bob,
    });

    await market.borrow({
      user: bob,
      amount: new anchor.BN(1),
      shares: new anchor.BN(0),
      owner: bob,
      recipient: bob,
    });
  });

  it("switchboard borrow fails if price is stale", async () => {
    // TODO: Fixme
  });


  it("pyth confidence exceeds price in solvent check", async () => {

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(17905),
      conf: new anchor.BN(0),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    await market.createAndSetAuthority({ user: larry });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1_000 * 1e9),
      shares: new anchor.BN(0),
      owner: larry
    });

    await market.depositCollateral({
      user: bob,
      amount: new anchor.BN(1_000_000 * 1e9),
      owner: bob,
    });

    await market.collateral.setPrice({
      price: new anchor.BN(100 * 1e9), // $100.00
      conf: new anchor.BN(101 * 1e9),
    });

    await assert.rejects(
      async () => {
        await market.borrow({
          user: bob,
          amount: new anchor.BN(10 * 1e9),
          shares: new anchor.BN(0),
          owner: bob,
          recipient: bob,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6010);
        assert.strictEqual(err.error.errorMessage, "Math Underflow");
        return true;
      }
    );
  });
});
