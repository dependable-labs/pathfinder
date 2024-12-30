import { setupTest } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { TimeUtils } from "../utils";

describe("Repay", () => {
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let accounts: any;

  let market: MarketFixture;
  let larry: UserFixture;
  let bob: UserFixture;

  beforeEach(async () => {
    let context = await startAnchor("", [], []);
    provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest({
      provider,
      banks: context.banksClient,
      quoteDecimals: 9,
      collateralDecimals: 9,
    }));

    larry = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await larry.init_and_fund_accounts(
      new anchor.BN(1000 * 1e9),
      new anchor.BN(0)
    );

    bob = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await bob.init_and_fund_accounts(
      new anchor.BN(100 * 1e9),
      new anchor.BN(1000 * 1e9)
    );

    let controller = new ControllerFixture(program, provider);

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller
    );

    await market.setAuthority();

    // add collateral and initialize price
    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(100 * 10 ** 5),
      conf: new anchor.BN(10 * 1e5),
      expo: -5
    });

    await market.create({
      collateralSymbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
    });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1000 * 1e9),
      shares: new anchor.BN(0)
    });

    // Bob deposits 100 collateral tokens
    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });

    // Bob borrows 50 quote tokens against his collateral
    await market.borrow({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });
  });

  it("repays all debt", async () => {
    // Get initial balances and state
    const initialQuoteBalance = await bob.get_quo_balance();
    const initialMarketData = await market.marketAcc.get_data();
    const initialBorrowerShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Repay the full 50 tokens that were borrowed
    await market.repay({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });

    // Get final state
    const finalQuoteBalance = await bob.get_quo_balance();
    const finalMarketData = await market.marketAcc.get_data();
    const finalBorrowerShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Verify quote token balance decreased by repayment amount
    assert.equal(
      initialQuoteBalance - finalQuoteBalance,
      BigInt(50 * 1e9),
      "Quote balance should decrease by 50 tokens"
    );

    // Verify market total borrow assets decreased
    assert.ok(
      finalMarketData.totalBorrowAssets.eq(
        initialMarketData.totalBorrowAssets.sub(new anchor.BN(50 * 1e9))
      ),
      "Market total borrow assets should decrease by 50"
    );

    // Verify market total borrow shares decreased
    assert.ok(
      finalMarketData.totalBorrowShares.eq(new anchor.BN(0)),
      "Market total borrow shares should decrease by user's shares"
    );

    // Verify user has no remaining borrow shares
    assert.ok(
      finalBorrowerShares.borrowShares.eq(new anchor.BN(0)),
      "User should have no remaining borrow shares"
    );

    // Verify bob's final quote balance is correct
    assert.equal(
      finalQuoteBalance,
      BigInt(100 * 1e9), // Started with 0, borrowed 50, repaid 50
      "Bob's final quote balance should be 950 tokens"
    );
  });

  it("repays all debt with interest", async () => {
    // Get initial balances and state
    const initialQuoteBalance = await bob.get_quo_balance();
    const initialMarketData = await market.marketAcc.get_data();
    const initialBorrowerShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Instead of converting to number, compare BNs directly -> 0.05 * 1e18
    assert.ok(initialBorrowerShares.borrowShares.eq(new anchor.BN("50000000000000000")));

    // Move time forward one day
    await TimeUtils.moveTimeForward(provider.context, 1 * 24 * 60 * 60);

    // See impact of interest accrual
    await market.accrueInterest();

    // Repay the full 50 tokens that were borrowed
    await market.repay({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(0),
      shares: new anchor.BN("50000000000000000")
    });

    // Get final state
    const finalQuoteBalance = await bob.get_quo_balance();
    const finalMarketData = await market.marketAcc.get_data();
    const finalBorrowerShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Verify quote token balance decreased by repayment amount
    assert.equal(
      initialQuoteBalance - finalQuoteBalance,
      BigInt(50.000079910 * 1e9),
      "Quote balance should decrease by 50 tokens"
    );

    console.log("here ", finalMarketData.totalBorrowAssets.toString());

    // Verify market total borrow assets decreased
    assert(
      finalMarketData.totalBorrowAssets.eq(new anchor.BN(0.001518289 * 1e9)),
      "Market total borrow assets should decrease by 50"
    );

    // Verify market total borrow shares decreased
    assert.ok(
      finalMarketData.totalBorrowShares.eq(new anchor.BN(0)),
      "Market total borrow shares should decrease by user's shares"
    );

    // Verify user has no remaining borrow shares
    assert.ok(
      finalBorrowerShares.borrowShares.eq(new anchor.BN(0)),
      "User should have no remaining borrow shares"
    );

    // Verify bob's final quote balance is correct
    assert.equal(
      finalQuoteBalance,
      BigInt(99.999920090 * 1e9 ), // Started with 0, borrowed 50, repaid 50
      "Bob's final quote balance should be 950 tokens"
    );
  });

  it("repays partial debt", async () => {

    // Setup initial state
    await market.borrow({
      user: bob,
      symbol: "BONK", 
      amount: new anchor.BN(50 * 1e9), // Borrow additional 50 tokens
      shares: new anchor.BN(0)
    });

    const initialQuoteBalance = await bob.get_quo_balance();
    const initialMarketData = await market.marketAcc.get_data();
    const initialBorrowerShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Repay half of the borrowed amount
    await market.repay({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(25 * 1e9), // Repay 25 tokens
      shares: new anchor.BN(0)
    });


    // Get final state
    const finalQuoteBalance = await bob.get_quo_balance();
    const finalMarketData = await market.marketAcc.get_data();
    const finalBorrowerShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Verify quote token balance decreased by repayment amount
    assert.equal(
      initialQuoteBalance - finalQuoteBalance,
      BigInt(25 * 1e9),
      "Quote balance should decrease by 25 tokens"
    );

    // Verify market total borrow assets decreased by repayment amount
    assert.ok(
      finalMarketData.totalBorrowAssets.eq(
        initialMarketData.totalBorrowAssets.sub(new anchor.BN(25 * 1e9))
      ),
      "Market total borrow assets should decrease by 25"
    );

    // Verify bob's final quote balance is correct
    assert.equal(
      finalQuoteBalance,
      BigInt(175 * 1e9), // Started with 50, borrowed 50, repaid 25
      "Bob's final quote balance should be 25 tokens"
    );
  });

  it("fails to repay when no debt", async () => {
    // First borrow against the collateral
    await market.borrow({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });

    // Try to withdraw collateral
    await assert.rejects(
      async () => {
        await market.withdrawCollateral({
          user: bob,
          symbol: "BONK",
          amount: new anchor.BN(100 * 1e9)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "User is not solvent");
        return true;
      }
    );
  });
});

