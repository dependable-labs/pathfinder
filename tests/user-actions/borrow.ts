import { setupTest } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";

describe("User Borrow", () => {
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let accounts: any;

  let market: MarketFixture;
  let larry: UserFixture;
  let bob: UserFixture;

  beforeEach(async () => {
    let context = await startAnchor("", [], []);
    provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest(provider, context.banksClient));

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

    await market.setAuthority(larry);

    // add collateral and initialize price
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
      debtCap: new anchor.BN(1000000000),
      ltvFactor: new anchor.BN(0),
    });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(1000000000),
      shares: new anchor.BN(0)
    });

    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(1000000000)
    });
  });

  it("borrows from a market", async () => {
    const initialBalance = await bob.get_quo_balance();

    await market.borrow({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(500000000),
      shares: new anchor.BN(0)
    });

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(
      marketAccountData.totalBorrowShares.toNumber(),
      500000000000000
    );
    assert.equal(
      marketAccountData.totalBorrowAssets.toNumber(),
      500000000
    );

    const userSharesAccountData = await market
      .get_user_shares(bob.key.publicKey)
      .get_data();
    assert.equal(
      userSharesAccountData.borrowShares.toNumber(),
      500000000000000
    );

    const finalBalance = await bob.get_quo_balance();
    assert.equal(
      finalBalance - initialBalance,
      BigInt(500000000)
    );
  });

  // it("fails to borrow without collateral", async () => {
    // await assert.rejects(
    //   async () => {
    //     await market.borrow({
    //       user: larry,
    //       symbol: "JITO",
    //       amount: new anchor.BN(500000000),
    //       shares: new anchor.BN(0)
    //     });
    //   },
    //   (err: anchor.AnchorError) => {
    //     assert.strictEqual(err.error.errorCode.number, 6003);
    //     assert.strictEqual(err.error.errorMessage, 'Insufficient collateral for borrow');
    //     return true;
    //   }
    // );
  // });

  // it("fails to borrow more than debt cap", async () => {
  //   await assert.rejects(
  //     async () => {
  //       await market.borrow({
  //         user: bob,
  //         symbol: "BONK",
  //         amount: new anchor.BN(2000000000), // More than debt cap
  //         shares: new anchor.BN(0)
  //       });
  //     },
  //     (err: anchor.AnchorError) => {
  //       assert.strictEqual(err.error.errorCode.number, 6017);
  //       assert.strictEqual(err.error.errorMessage, 'Debt cap exceeded');
  //       return true;
  //     }
  //   );
  // });
});
