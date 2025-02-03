import { TestUtils } from "../utils";
import { MarketFixture, UserFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";

describe("Config Operations", () => {
  let test: TestUtils;
  let market: MarketFixture;
  let larry: UserFixture;
  let lilly: UserFixture;
  let bob: UserFixture;
  let futarchy: UserFixture;

  beforeEach(async () => {
    test = await TestUtils.create({
      quoteDecimals: 9,
      collateralDecimals: 9,
    });

    larry = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    lilly = await test.createUser(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    bob = await test.createUser(
      new anchor.BN(1_000_000 * 1e9),
      new anchor.BN(1_000_000 * 1e9)
    );

    futarchy = await test.createUser(
      new anchor.BN(0),
      new anchor.BN(0)
    );

    market = await test.createMarket({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(10 * 1e9),
      expo: -9,
      feeRecipient: futarchy,
      authority: futarchy,
    });

    await market.createAndSetAuthority({ user: larry });

  });

  it("sets and restricts based on authority", async () => {

    const preConfigData = await market.get_config().get_data();
    assert.equal(preConfigData.authority.toBase58(), futarchy.key.publicKey.toBase58());

    await assert.rejects(
      async () => {
        await market.updateAuthority({
          user: larry,
          new_authority: lilly,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6018);
        assert.strictEqual(err.error.errorMessage, "Invalid authority"); // wrong err!
        return true;
      }
    );

    await market.updateAuthority({
      user: futarchy,
      new_authority: lilly,
    });

    const postConfigData = await market.get_config().get_data();
    assert.equal(postConfigData.authority.toBase58(), lilly.key.publicKey.toBase58());

  });

  it("sets and restricts update fee based on authority", async () => {
    const preConfigData = await market.get_config().get_data();
    assert.equal(preConfigData.feeFactor.toString(), "0");

    await assert.rejects(
      async () => {
        await market.updateFee({
          user: larry,
          feeFactor: new anchor.BN("10000000000000000"),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6018);
        assert.strictEqual(err.error.errorMessage, "Invalid authority"); // wrong err!
        return true;
      }
    );

    await market.updateFee({
      user: futarchy,
      feeFactor: new anchor.BN("10000000000000000"),
    });

    const postConfigData = await market.get_config().get_data();
    assert.equal(postConfigData.feeFactor.toString(), "10000000000000000");

  });

  it("sets and restricts update recipient based on authority", async () => {
    const preConfigData = await market.get_config().get_data();
    assert.equal(preConfigData.feeRecipient.toBase58(), futarchy.key.publicKey.toBase58());

    await assert.rejects(
      async () => {
        await market.updateRecipient({
          user: larry,
          new_recipient: lilly,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6018);
        assert.strictEqual(err.error.errorMessage, "Invalid authority"); // wrong err!
        return true;
      }
    );

    await market.updateRecipient({
      user: futarchy,
      new_recipient: lilly,
    });

    const postConfigData = await market.get_config().get_data();
    assert.equal(postConfigData.feeRecipient.toBase58(), lilly.key.publicKey.toBase58());
  });


  it("correctly for a year with protocol fee", async () => {
    // Setup initial state: deposit, collateralize, and borrow

     // Add this check before deposit

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1_000 * 1e9),
      shares: new anchor.BN(0),
      owner: larry,
    });

    await market.depositCollateral({
      user: bob,
      amount: new anchor.BN(100 * 1e9),
      owner: bob,
    });

    await market.borrow({
      user: bob,
      amount: new anchor.BN(500 * 1e9),
      shares: new anchor.BN(0),
      owner: bob,
      recipient: bob,
    });

    const beforeTotalBorrows = await market.marketAcc.getTotalBorrows();
    const beforeTotalDeposits = await market.marketAcc.getTotalDeposits();

    // Set protocol fee to 1%
    await market.updateFee({
      user: futarchy,
      feeFactor: new anchor.BN("10000000000000000")
    });
    
    // Advance clock by 1 year
    await test.moveTimeForward(365 * 24 * 3600);
    
    await market.accrueInterest();

    const afterTotalBorrows = await market.marketAcc.getTotalBorrows();
    const afterTotalDeposits = await market.marketAcc.getTotalDeposits();

    // Convert to BN and calculate difference
    const borrowDifference = afterTotalBorrows.sub(beforeTotalBorrows);
    const depositDifference = afterTotalDeposits.sub(beforeTotalDeposits);
    
    // Verify interest accrual
    assert.equal(
      borrowDifference.toNumber(),
      13_512_691_343 // Expected interest accrual
    );
 
    assert.equal(
      depositDifference.toNumber(),
      27_032_613_361 // Same total interest
    );

    // Repay full borrow amount
    await market.repay({
      user: bob,
      amount: new anchor.BN(0),
      shares: (await market.get_borrower_shares(bob.key.publicKey).get_data()).borrowShares,
      owner: bob,
    });

    // Verify all borrow shares have been repaid
    const totalBorrowShares = (await market.marketAcc.get_data()).totalBorrowShares;
    assert.equal(
      totalBorrowShares.toNumber(),
      0
    );

    // Verify fee recipient shares
    const feeShares = (await market.marketAcc.get_data()).feeShares;
    assert.equal(
      feeShares.toNumber(),
      270_253_826 // 1% of total interest accrued
    );

    // Verify total deposits in pool
    const totalDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(
      totalDeposits.toNumber(),
      1_027_032_613_361 // Initial 100B deposit + total interest accrued
    );

    await assert.rejects(
      async () => {
        await market.withdrawFee({
          user: larry,
          amount: new anchor.BN(0),
          shares: new anchor.BN(feeShares),
          recipient: futarchy,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6017);
        assert.strictEqual(err.error.errorMessage, "Invalid recipient"); // wrong err!
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await market.withdrawFee({
          user: futarchy,
          amount: new anchor.BN(0),
          shares: new anchor.BN(feeShares),
          recipient: larry,
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6017);
        assert.strictEqual(err.error.errorMessage, "Invalid recipient"); // wrong err!
        return true;
      }
    );

    await market.withdrawFee({
      user: futarchy,
      amount: new anchor.BN(0),
      shares: new anchor.BN(feeShares),
      recipient: futarchy,
    });

    // Verify fee recipient shares
    const feeSharesAfterWithdraw = (await market.marketAcc.get_data()).feeShares;
    assert.equal(
      feeSharesAfterWithdraw.toNumber(),
      0
    );

    // Verify fee recipient shares
    const futarchyQuoteAfterWithdraw = await futarchy.get_quo_balance();
    assert.equal(
      futarchyQuoteAfterWithdraw,
      BigInt(277_484_501)
    );

  });
});
