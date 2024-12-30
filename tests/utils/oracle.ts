import { setupTest } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { TimeUtils } from "../utils";


describe("Oracle", () => {
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
      price: new anchor.BN(100 * 10 ** 9),
      conf: new anchor.BN(10 * 1e9),
      expo: -9,
    });

    await market.create({
      collateralSymbol: "BONK",
      ltvFactor: new anchor.BN(0.8 * 1e9),
    });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1000 * 1e9),
      shares: new anchor.BN(0),
    });

    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(1 * 1e9),
    });
  });

  it("oracle price returns none if price is too old", async () => {

    await TimeUtils.moveTimeForward(provider.context, 3601);

    // TODO: Fixme
    await assert.rejects(
      async () => {
        await market.borrow({
          user: bob,
          symbol: "BONK",
          amount: new anchor.BN(10 * 1e9),
          shares: new anchor.BN(0),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 16000);
        assert.strictEqual(err.error.errorMessage, "This price feed update's age exceeds the requested maximum age");
        return true;
      }
    );
  });

  it("confidence exceeds price in solvent check", async () => {
    await market.getCollateral("BONK").setPrice({
      price: new anchor.BN(100 * 1e9), // $100.00
      conf: new anchor.BN(101 * 1e9),
    });

    await assert.rejects(
      async () => {
        await market.borrow({
          user: bob,
          symbol: "BONK",
          amount: new anchor.BN(10 * 1e9),
          shares: new anchor.BN(0),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6009);
        assert.strictEqual(err.error.errorMessage, "Math overflow");
        return true;
      }
    );
  });

  it("confidence exceeds price in liquidation check", async () => {
    await market.borrow({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(70 * 1e9),
      shares: new anchor.BN(0),
    });

    // advance 1 year
    await TimeUtils.moveTimeForward(provider.context, 365 * 24 * 60 * 60);

    await market.getCollateral("BONK").setPrice({
      price: new anchor.BN(100 * 1e9), // $100.00
      conf: new anchor.BN(101 * 1e9),
    });

    await assert.rejects(
      async () => {
        await market.liquidate({
          user: bob,
          symbol: "BONK",
          borrower: bob.key.publicKey,
          collateralAmount: new anchor.BN(0),
          repayShares: new anchor.BN(10 * 1e9),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6009);
        assert.strictEqual(err.error.errorMessage, "Math overflow");
        return true;
      }
    );
  });
});
