import * as anchor from "@coral-xyz/anchor";
import { setupTest } from "../utils";
import { ControllerFixture, MarketFixture } from "../fixtures";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { startAnchor, BankrunProvider } from "anchor-bankrun";
import { UserFixture } from "../fixtures";
describe("Update Market Operations", () => {
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let market: MarketFixture;
  let accounts: any;
  let larry: UserFixture;

  beforeEach(async () => {
    let context = await startAnchor("", [], []);
    provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest({
      provider,
      banks: context.banksClient,
      quoteDecimals: 9,
      collateralDecimals: 9,
    }));

    let controller = new ControllerFixture(program, provider);

    // team member who will set the futarchy authority
    larry = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await larry.init_and_fund_accounts(
      new anchor.BN(999999999999),
      new anchor.BN(0)
    );

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller // futarchy treasury authority
    );
    await market.setAuthority();

    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(100 * 10 ** 9),
      conf: new anchor.BN((100 / 10) * 10 ** 9),
      expo: -9,
    });

    await market.create({
      collateralSymbol: "BONK",
      ltvFactor: new anchor.BN(0),
    });
  });

  it("updates a market", async () => {
    const initialCollateralAccountData = await market
      .getCollateral("BONK")
      .collateralAcc.get_data();
    assert.equal(initialCollateralAccountData.ltvFactor.toNumber(), 0);

    await market.update({
      symbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e6),
      isActive: true,
    });

    const marketAccountData = await market.marketAcc.get_data();

    assert.equal(
      marketAccountData.quoteMint.toBase58(),
      accounts.quoteMint.toBase58()
    );
    assert.equal(
      marketAccountData.quoteMintDecimals,
      9,
      "Quote mint decimals should be 9"
    );
    assert.equal(marketAccountData.totalQuote.toNumber(), 0);
    assert.equal(marketAccountData.totalShares.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowAssets.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowShares.toNumber(), 0);

    const collateralAccountData = await market
      .getCollateral("BONK")
      .collateralAcc.get_data();
    assert.equal(collateralAccountData.ltvFactor.toNumber(), 0.8 * 1e6);
  });

  it("fails when non-authority tries to update market", async () => {
    // Create a non-authority user
    const nonAuthority = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await nonAuthority.init_and_fund_accounts(
      new anchor.BN(999999999999),
      new anchor.BN(0)
    );

    await assert.rejects(
      async () => {
        await market.update({
          symbol: "BONK", 
          ltvFactor: new anchor.BN(0.8 * 1e6),
          isActive: true,
          overrideAuthority: nonAuthority, // Pass non-authority keypair
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 2003); // Updated error code
        assert.strictEqual(err.error.errorMessage, 'A raw constraint was violated'); // Updated error message
        return true;
      },
      "Expected update to fail when called by non-authority"
    );

    // Verify market was not updated
    const collateralAccountData = await market
      .getCollateral("BONK")
      .collateralAcc.get_data();
    assert.equal(collateralAccountData.ltvFactor.toNumber(), 0); // Should still be initial value
  });
});
