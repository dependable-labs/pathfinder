import { TestUtils } from "../utils";
import { MarketFixture, UserFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";

describe("User Borrow", () => {
  let test: TestUtils;
  let accounts: any;

  let market: MarketFixture;
  let larry: UserFixture;
  let bob: UserFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
        quoteDecimals: 9,
        collateralDecimals: 9,
    });
  
    larry = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );
  
    bob = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(1_000 * 1e9),
    );
  
    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(10 * 1e9), // upperbound: 110 * 1e9, lowerbound: 90 * 1e9
      expo: -9,
    });  

    await market.create({user: larry});

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1 * 1e9),
      shares: new anchor.BN(0),
    });

    await market.depositCollateral({
      user: bob,
      amount: new anchor.BN(1 * 1e9),
    });

  });

  it("borrows from a market", async () => {
    const initialBalance = await bob.get_quo_balance();

    await market.borrow({
      user: bob,
      amount: new anchor.BN(0.5 * 1e9), // 0.5 * 1e9
      shares: new anchor.BN(0),
    });

    const marketAccountData = await market.marketAcc.get_data();
    const totalBorrows = await market.marketAcc.getTotalBorrows();

    assert.equal(
      marketAccountData.totalBorrowShares.toNumber(),
      500000000
    );
    assert.equal(totalBorrows.toNumber(), 500000000);

    const userSharesAccountData = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();
    assert.equal(
      userSharesAccountData.borrowShares.toNumber(),
      500000000
    );

    const finalBalance = await bob.get_quo_balance();
    assert.equal(finalBalance - initialBalance, BigInt(500000000));
  });

  it("fails to borrow without collateral", async () => {
    //TODO: Fixme
    await assert.rejects(
      async () => {
        await market.borrow({
          user: larry,
          amount: new anchor.BN(100 * 1e9),
          shares: new anchor.BN(0),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 3012);
        assert.strictEqual(err.error.errorMessage, "The program expected this account to be already initialized"); // wrong err!
        return true;
      }
    );
  });

  it("fails to borrow more than collateral value", async () => {
    await assert.rejects(
      async () => {
        await market.borrow({
          user: bob,
          amount: new anchor.BN(1000_000_000_001), // 1 More than debt cap
          shares: new anchor.BN(0),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6011);
        assert.strictEqual(err.error.errorMessage, "User is not solvent"); // wrong err!
        return true;
      }
    );
  });
});
