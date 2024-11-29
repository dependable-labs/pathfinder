import { setupTest } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";

describe("Liquidate", () => {
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let accounts: any;

  let market: MarketFixture;
  let liquidator: UserFixture;  // User performing the liquidation
  let borrower: UserFixture;    // User being liquidated
  let lender: UserFixture;      // User providing liquidity

  beforeEach(async () => {
    let context = await startAnchor("", [], []);
    provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest({
      provider,
      banks: context.banksClient,
      quoteDecimals: 9,
      collateralDecimals: 9,
    }));

    // Setup lender with quote tokens to provide liquidity
    lender = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await lender.init_and_fund_accounts(
      new anchor.BN(1000000000000),  // 1000 quote tokens
      new anchor.BN(0)
    );

    // Setup borrower with collateral
    borrower = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await borrower.init_and_fund_accounts(
      new anchor.BN(0),
      new anchor.BN(1000 * 1e9)  // 1000 collateral tokens
    );

    // Setup liquidator with quote tokens to repay debt
    liquidator = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await liquidator.init_and_fund_accounts(
      new anchor.BN(1000 * 1e9),  // 1000 quote tokens
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

    // Add collateral with initial price of $1
    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(1e5),  // $1.00
      conf: new anchor.BN(1 * 10 ** 4),     // $0.01 confidence interval
      expo: -5
    });

    await market.create({
      collateralSymbol: "BONK",
      debtCap: new anchor.BN(1_000 * 1e9),
      ltvFactor: new anchor.BN(8 * 1e8),  // 80% LTV
    });

    // Lender deposits quote tokens
    await market.deposit({
      user: lender,
      amount: new anchor.BN(1000 * 1e9),  // 1000 quote tokens
      shares: new anchor.BN(0)
    });

    // Borrower deposits collateral
    await market.depositCollateral({
      user: borrower,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)  // 100 collateral tokens
    });

    // Borrower takes out a loan
    await market.borrow({
      user: borrower,
      symbol: "BONK",
      amount: new anchor.BN(75 * 1e9),  // 75 quote tokens (75% LTV)
      shares: new anchor.BN(0)
    });
  });

  it("liquidates an underwater position", async () => {
    // Update price to make position underwater (50% price drop)
    await market.getCollateral("BONK").setPrice({
      price: new anchor.BN(5 * 1e4),  // $0.50
      conf: new anchor.BN(1 * 10 ** 4),
    });

    const initialBorrowerShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(borrower.key.publicKey)
      .get_data();
    const initialLiquidatorQuote = await liquidator.get_quo_balance();
    const initialLiquidatorCollateral = await liquidator.get_col_balance();

    // Perform liquidation
    await market.liquidate({
      user: liquidator,
      symbol: "BONK",
      borrower: borrower.key.publicKey,
      collateralAmount: new anchor.BN(2 * 1e9),
      repayShares: new anchor.BN(0)
    });

    const finalLiquidatorQuote = await liquidator.get_quo_balance();
    const finalLiquidatorCollateral = await liquidator.get_col_balance();

    // Verify liquidator's balance changes
    assert.equal(
      initialLiquidatorQuote - finalLiquidatorQuote,
      BigInt(869_565_218),  // Spent quote tokens
      "Incorrect quote token change"
    );

    assert.equal(
      finalLiquidatorCollateral - initialLiquidatorCollateral,
      BigInt(2_000_000_000),
      "Incorrect collateral received"
    );

    // Verify borrower's position was updated
    const borrowerShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(borrower.key.publicKey)
      .get_data();

    assert.ok(
      borrowerShares.borrowShares < initialBorrowerShares.borrowShares,
      "Borrow position should be reduced"
    );
  });

  it("fails to liquidate a healthy position", async () => {
    await assert.rejects(
      async () => {
        await market.liquidate({
          user: liquidator,
          symbol: "BONK",
          borrower: borrower.key.publicKey,
          collateralAmount: new anchor.BN(2 * 1e9),
          repayShares: new anchor.BN(0)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Borrower is solvent");
        return true;
      }
    );
  });

  it("fails if liquidator lacks sufficient quote tokens", async () => {
    // Update price to make position underwater (50% price drop)
    await market.getCollateral("BONK").setPrice({
      price: new anchor.BN(5 * 1e4),  // $0.50
      conf: new anchor.BN(1 * 10 ** 4),
    });

    // Create liquidator with insufficient funds
    let poorLiquidator = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );

    await poorLiquidator.init_and_fund_accounts(
      new anchor.BN(1 * 1e9),  // Only 1 quote token
      new anchor.BN(0)
    );

    await assert.rejects(
      async () => {
        await market.liquidate({
          user: poorLiquidator,
          symbol: "BONK",
          borrower: borrower.key.publicKey,
          collateralAmount: new anchor.BN(3 * 1e9),
          repayShares: new anchor.BN(0)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorMessage, "Insufficient balance");
        return true;
      }
    );
  });
});

