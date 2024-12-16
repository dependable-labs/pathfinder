import { setupTest, TimeUtils } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";

describe("Restrict Collateral", () => {
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let accounts: any;
  let market: MarketFixture;
  let larry: UserFixture; // Lender
  let bob: UserFixture;   // Borrower
  let liquidator: UserFixture; // Liquidator

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
      new anchor.BN(10000 * 1e9), // Quote tokens for lending
      new anchor.BN(0)
    );

    bob = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await bob.init_and_fund_accounts(
      new anchor.BN(1000 * 1e9), // Quote tokens for repaying
      new anchor.BN(1000 * 1e9)  // Collateral for borrowing
    );

    // Setup liquidator with quote tokens to repay debt
    liquidator = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await liquidator.init_and_fund_accounts(
      new anchor.BN(10_000 * 1e9),  // 1000 quote tokens
      new anchor.BN(0)
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
    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(100 * 10 ** 9),
      conf: new anchor.BN(100 / 10 * 10 ** 9),
      expo: -9
    });

    await market.create({
      collateralSymbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
    });

    // Setup initial lending pool
    await market.deposit({
      user: larry,
      amount: new anchor.BN(10000 * 1e9),
      shares: new anchor.BN(0)
    });
  });


  it("prevents new borrows after restriction", async () => {

    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });

    // First restrict the collateral
    await market.update({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9), // matches LTV on market creation
      isActive: false,
    });


    // Attempt to borrow
    await assert.rejects(
      async () => {
        await market.borrow({
          user: bob,
          symbol: "BONK",
          amount: new anchor.BN(50000000),
          shares: new anchor.BN(0)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6020);
        assert.strictEqual(err.error.errorMessage, "Collateral is not active");
        return true;
      }
    );
  });


  it("prevents new collateral deposits after restriction", async () => {
    await market.update({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9), // matches LTV on market creation
      isActive: false,
    });

    await assert.rejects(
      async () => {
        await market.depositCollateral({
          user: bob,
          symbol: "BONK",
          amount: new anchor.BN(100000000)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6020);
        assert.strictEqual(err.error.errorMessage, "Collateral is not active");
        return true;
      }
    );
  });


  it("allows repayment after restriction", async () => {
    // Setup initial borrow position
    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });

    await market.borrow({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });

    // Restrict collateral
    await market.update({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9), // matches LTV on market creation
      isActive: false,
    });

    // Verify repayment still works
    await market.repay({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });

    const borrowerShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(borrowerShares.borrowShares.toNumber(), 0);
  });


  it("repayment after restriction one day", async () => {
    // Setup initial borrow position
    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });

    await market.borrow({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });

    // Should have 1000 * 1e9 + 50 * 1e9 quote tokens
    const bobPriorQuoteBalance = await bob.get_quo_balance();
    assert.equal(bobPriorQuoteBalance, BigInt(1050 * 1e9));

    const borrowerSharesPrior = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Instead of converting to number, compare BNs directly -> 0.05 * 1e18
    assert.ok(borrowerSharesPrior.borrowShares.eq(new anchor.BN("50000000000000000")));

    // Restrict collateral
    await market.update({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9), // matches LTV on market creation
      isActive: false,
    });

    // Move time forward one day
    await TimeUtils.moveTimeForward(provider.context, 1 * 24 * 60 * 60);

    // See impact of interest accrual
    await market.accrueInterest();
    const totalBorrowedAssets = await market.marketAcc.get_data();
    assert.equal(totalBorrowedAssets.totalBorrowAssets.toNumber(), 50.001392713 * 1e9);

    // Repayment should be all outstanding debt + the fee
    await market.repay({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(0),
      shares: new anchor.BN("50000000000000000")
    });

    // Get bob's quote balance after repayment
    const bobPostRepaymentQuoteBalance = await bob.get_quo_balance();
    assert.equal(bobPostRepaymentQuoteBalance, BigInt(999.783993006 * 1e9));

    const borrowerSharesPostRepayment = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(borrowerSharesPostRepayment.borrowShares.toNumber(), 0);

    const totalBorrowShares = await market.marketAcc.get_data();
    console.log(totalBorrowShares.totalBorrowShares.toNumber());
    assert.equal(totalBorrowShares.totalBorrowShares.toNumber(), 0);

    // borrower pays fee on top of interest accrued
    assert.equal(bobPriorQuoteBalance - bobPostRepaymentQuoteBalance, BigInt(50.216006994 * 1e9));
  });

  it("repayment after restriction one week", async () => {
    // Setup initial borrow position
    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });

    await market.borrow({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(50 * 1e9),
      shares: new anchor.BN(0)
    });

    // Should have 1000 * 1e9 + 50 * 1e9 quote tokens
    const bobPriorQuoteBalance = await bob.get_quo_balance();
    assert.equal(bobPriorQuoteBalance, BigInt(1050 * 1e9));

    const borrowerSharesPrior = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Instead of converting to number, compare BNs directly -> 0.05 * 1e18
    assert.ok(borrowerSharesPrior.borrowShares.eq(new anchor.BN("50000000000000000")));

    // Restrict collateral
    await market.update({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9), // matches LTV on market creation
      isActive: false,
    });

    // Move time forward one day
    await TimeUtils.moveTimeForward(provider.context, 7 * 24 * 60 * 60);

    // See impact of interest accrual
    await market.accrueInterest();
    const totalBorrowedAssets = await market.marketAcc.get_data();
    assert.equal(totalBorrowedAssets.totalBorrowAssets.toNumber(), 50.009749808 * 1e9);

    // Repayment should be all outstanding debt + the fee
    await market.repay({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(0),
      shares: new anchor.BN("50000000000000000")
    });

    // Get bob's quote balance after repayment
    const bobPostRepaymentQuoteBalance = await bob.get_quo_balance();
    assert.equal(bobPostRepaymentQuoteBalance, BigInt(998.487949776 * 1e9));

    const borrowerSharesPostRepayment = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(borrowerSharesPostRepayment.borrowShares.toNumber(), 0);

    const totalBorrowShares = await market.marketAcc.get_data();
    console.log(totalBorrowShares.totalBorrowShares.toNumber());
    assert.equal(totalBorrowShares.totalBorrowShares.toNumber(), 0);

    // borrower pays fee on top of interest accrued
    assert.equal(bobPriorQuoteBalance - bobPostRepaymentQuoteBalance - BigInt(50 * 1e9), BigInt(1.512050224 * 1e9));
  });  

  it("liquidation after restriction one week", async () => {
    // Setup initial borrow position
    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });

    await market.borrow({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(7980 * 1e9),
      shares: new anchor.BN(0)
    });

    const borrowerSharesPrior = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Instead of converting to number, compare BNs directly -> 0.05 * 1e18
    assert.ok(borrowerSharesPrior.borrowShares.eq(new anchor.BN("7980000000000000000")));

    // Restrict collateral
    await market.update({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9), // matches LTV on market creation
      isActive: false,
    });

    // Move time forward one week
    await TimeUtils.moveTimeForward(provider.context, 7 * 24 * 60 * 60);

    // See impact of interest accrual
    await market.accrueInterest();
    const totalBorrowedAssets = await market.marketAcc.get_data();
    assert.equal(totalBorrowedAssets.totalBorrowAssets.toNumber(), 7985.603270394 * 1e9);

    await market.getCollateral("BONK").setPrice({
      price: new anchor.BN(100 * 1e9),  // $100.00
      conf: new anchor.BN(1 * 10 ** 9),
    });

    // Get liquidator's quote balance before liquidation
    const liquidatorPriorQuoteBalance = await liquidator.get_quo_balance();
    assert.equal(liquidatorPriorQuoteBalance, BigInt(10_000 * 1e9));

    // liquidator can liquidate the position because of the added fee -> making borrower unhealthy
    await market.liquidate({
      user: liquidator,
      symbol: "BONK",
      borrower: bob.key.publicKey,
      collateralAmount: new anchor.BN(0),
      repayShares: new anchor.BN("7980000000000000000")
    });

    // Get bob's quote balance after repayment
    const liquidatorPostLiquidationQuoteBalance = await liquidator.get_quo_balance();
    assert.equal(liquidatorPostLiquidationQuoteBalance, BigInt(1772.912086710 * 1e9));

    const borrowerSharesPostRepayment = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    assert.equal(borrowerSharesPostRepayment.borrowShares.toString(), "0");

    const totalBorrowShares = await market.marketAcc.get_data();
    assert.equal(totalBorrowShares.totalBorrowShares.toNumber(), 0);

    // Calculate and verify liquidator's quote token expenditure
    const liquidatorQuoteSpent = Number(liquidatorPriorQuoteBalance - liquidatorPostLiquidationQuoteBalance);

    assert.equal(
      liquidatorQuoteSpent,
      8227087913290,
      "Incorrect amount of quote tokens spent by liquidator"
    );

  });  
});
