import { TestUtils } from "../../utils";
import { MarketFixture, UserFixture } from "../../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";

describe("User Borrow", () => {
  let test: TestUtils;
  let accounts: any;

  let market: MarketFixture;
  let larry: UserFixture;
  let bob: UserFixture;
  let dan: UserFixture;

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

    dan = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0),
    );

    let futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    await test.initPathfinderProgram({
      payerAndRecipient: larry,
      authority: futarchy,
    });

    market = await test.createMarket({
      user: futarchy,
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(10 * 1e9), // upperbound: 110 * 1e9, lowerbound: 90 * 1e9
      expo: -9,
      authority: futarchy,
    });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1 * 1e9),
      shares: new anchor.BN(0),
      owner: larry,
    });

    await market.depositCollateral({
      user: bob,
      amount: new anchor.BN(1 * 1e9),
      owner: bob,
    });
  });

  it("borrows from a market", async () => {
    const initialBalance = await bob.get_quo_balance();

    await market.borrow({
      user: bob,
      amount: new anchor.BN(0.5 * 1e9), // 0.5 * 1e9
      shares: new anchor.BN(0),
      owner: bob,
      recipient: bob,
    });

    const marketAccountData = await market.marketAcc.get_data();
    const totalBorrows = await market.marketAcc.getTotalBorrows();

    assert.equal(
      marketAccountData.totalBorrowShares.toNumber(),
      500000000
    );
    assert.equal(totalBorrows.toNumber(), 500000000);

    const lenderSharesAccountData = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();
    assert.equal(
      lenderSharesAccountData.borrowShares.toNumber(),
      500000000
    );

    const finalBalance = await bob.get_quo_balance();
    assert.equal(finalBalance - initialBalance, BigInt(500000000));
  });

  it("borrows with delegate from a market", async () => {
    const initialBalance = await bob.get_quo_balance();

    await assert.rejects(
      async () => {
        await market.borrow({
          user: dan,
          amount: new anchor.BN(0.5 * 1e9),
          shares: new anchor.BN(0), 
          owner: bob,
          recipient: bob,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Unauthorized delegate");
        return true;
      }
    );

    await market.initDelegate({
      user: bob,
      newDelegate: dan,
    });

    await market.borrow({
      user: dan,
      amount: new anchor.BN(0.5 * 1e9), // 0.5 * 1e9
      shares: new anchor.BN(0),
      owner: bob,
      recipient: bob,
      delegate: dan
    });

    const marketAccountData = await market.marketAcc.get_data();
    const totalBorrows = await market.marketAcc.getTotalBorrows();

    assert.equal(
      marketAccountData.totalBorrowShares.toNumber(),
      500000000
    );
    assert.equal(totalBorrows.toNumber(), 500000000);

    const borrowerSharesAccountData = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();
    assert.equal(
      borrowerSharesAccountData.borrowShares.toNumber(),
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
          owner: larry,
          recipient: larry,
        });
      },
      (err: anchor.AnchorError) => {
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
          owner: bob,
          recipient: bob,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "User is not solvent"); // wrong err!
        return true;
      }
    );
  });

  it("borrows from a market with a delegate", async () => {
    const priorBobBalance = await bob.get_quo_balance();
    const priorLarryBalance = await larry.get_quo_balance();

    await market.initDelegate({
      user: bob,
      newDelegate: larry,
    });

    await market.borrow({
      user: larry,
      amount: new anchor.BN(0.5 * 1e9), // 0.5 * 1e9
      shares: new anchor.BN(0),
      owner: bob,
      recipient: larry,
      delegate: larry,
    });

    const marketAccountData = await market.marketAcc.get_data();
    const totalBorrows = await market.marketAcc.getTotalBorrows();

    assert.equal(
      marketAccountData.totalBorrowShares.toNumber(),
      500000000
    );
    assert.equal(totalBorrows.toNumber(), 500000000);

    const bobSharesAccountData = await market
      .get_borrower_shares(bob.key.publicKey)
      .get_data();
    assert.equal(
      bobSharesAccountData.borrowShares.toNumber(),
      500000000
    );

    const finalBobBalance = await bob.get_quo_balance();
    const finalLarryBalance = await larry.get_quo_balance();
    assert.equal(finalBobBalance - priorBobBalance, BigInt(0));
    assert.equal(finalLarryBalance - priorLarryBalance, BigInt(500000000));
  });
});
