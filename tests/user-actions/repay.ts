import { setupTest } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";

describe("Withdraw Collateral", () => {
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

    // Bob deposits 100 collateral tokens
    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });
  });

  it("withdraws all collateral when no borrows", async () => {
    const initialBalance = await bob.get_col_balance();
    const initialCollateralAmount = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Withdraw all 100 collateral tokens
    await market.withdrawCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });

    // Verify market state after withdrawal
    const collateralData = await market.getCollateral("BONK").collateralAcc.get_data();
    assert.equal(
      collateralData.totalCollateral.toNumber(),
      0,
      "Market should have no collateral"
    );

    // Verify user's collateral position is cleared
    const finalCollateralAmount = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();
    assert.equal(
      finalCollateralAmount.collateralAmount.toNumber(),
      0,
      "User's collateral amount should be zero"
    );

    // Verify collateral token balance change
    const finalBalance = await bob.get_col_balance();
    assert.equal(
      initialBalance - finalBalance,
      BigInt(100 * 1e9),
      "Collateral balance should increase by withdrawal amount"
    );
  });

  it("withdraws partial collateral when no borrows", async () => {
    const initialBalance = await bob.get_col_balance();
    const initialCollateralAmount = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();

    // Withdraw half (50 collateral tokens) of the 100 deposited
    await market.withdrawCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(50 * 1e9)
    });

    // Verify market state after partial withdrawal
    const collateralData = await market.getCollateral("BONK").collateralAcc.get_data();
    assert.equal(
      collateralData.totalCollateral.toNumber(),
      50 * 1e9,
      "Market should have remaining collateral"
    );

    // Verify user's remaining collateral position
    const finalCollateralAmount = await market
      .getCollateral("BONK")
      .get_borrower_shares(bob.key.publicKey)
      .get_data();
    assert.equal(
      finalCollateralAmount.collateralAmount.toNumber(),
      50 * 1e9,
      "User should have remaining collateral"
    );

    // Verify collateral token balance change
    const finalBalance = await bob.get_col_balance();
    assert.equal(
      initialBalance - finalBalance,
      BigInt(50 * 1e9),
      "Collateral balance should increase by withdrawal amount"
    );
  });

  it("fails to withdraw collateral when borrowed against", async () => {
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
