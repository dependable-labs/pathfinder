import { setupTest } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";

describe("User Repay", () => {
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
      new anchor.BN(1000000000000),
      new anchor.BN(0)
    );

    bob = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await bob.init_and_fund_accounts(
      new anchor.BN(0),
      new anchor.BN(1000000000000)
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
      conf: new anchor.BN(100 / 10 * 10 ** 9),
      expo: -5
    });

    await market.create({
      collateralSymbol: "BONK",
      debtCap: new anchor.BN(1_000 * 1e9),
      ltvFactor: new anchor.BN(0.8 * 1e9),
    });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1000 * 1e9),
      shares: new anchor.BN(0)
    });

    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });

    // // Have bob borrow 500 quote tokens
    await market.borrow({
      user: bob,
      symbol: "BONK", 
      amount: new anchor.BN(500 * 1e9), // 500 quote tokens
      shares: new anchor.BN(0)
    });
  });

  it("repay in full", async () => {
    // Get initial balances and positions
    const initialBalance = await bob.get_quo_balance();
    const initialBorrowShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Repay the full 500 quote tokens borrowed
    await market.repay({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(500 * 1e9),
      shares: new anchor.BN(0)
    });

    // Verify market state after repayment
    const marketData = await market.marketAcc.get_data();
    assert.equal(
      marketData.totalBorrowAssets.toNumber(),
      0,
      "Market should have no outstanding borrows"
    );
    assert.equal(
      marketData.totalBorrowShares.toNumber(),
      0,
      "Market should have no borrow shares"
    );

    // Verify user's borrow position is cleared
    const finalBorrowShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();
    assert.equal(
      finalBorrowShares.borrowShares.toNumber(),
      0,
      "User's borrow shares should be zero"
    );

    // Verify quote token balance change
    const finalBalance = await bob.get_quo_balance();
    assert.equal(
      initialBalance - finalBalance,
      BigInt(500 * 1e9),
      "Quote token balance should decrease by repayment amount"
    );
  });

  it("partial repay", async () => {
    // Get initial balances and positions
    const initialBalance = await bob.get_quo_balance();
    const initialBorrowShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Repay half (250 quote tokens) of the 500 borrowed
    await market.repay({
      user: bob,
      symbol: "BONK", 
      amount: new anchor.BN(250 * 1e9),
      shares: new anchor.BN(0)
    });

    // Verify market state after partial repayment
    const marketData = await market.marketAcc.get_data();
    marketData.totalBorrowAssets.eq(250 * 1e9)
    marketData.totalBorrowShares.eq(500 * 1e9)

    // Verify user's remaining borrow position
    const finalBorrowShares = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    finalBorrowShares.borrowShares.eq(500 * 1e9)

    // Verify quote token balance change
    const finalBalance = await bob.get_quo_balance();
    assert.equal(
      initialBalance - finalBalance,
      BigInt(250 * 1e9),
      "Quote token balance should decrease by partial repayment amount"
    );
  });
});
