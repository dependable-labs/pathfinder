import { setupTest } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";

describe("Withdraw", () => {
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let accounts: any;
  let market: MarketFixture;
  let larry: UserFixture;
  let lizz: UserFixture;

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

    lizz = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await lizz.init_and_fund_accounts(
      new anchor.BN(1000000000000),
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

    await market.setAuthority(larry);
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
      debtCap: new anchor.BN(100),
      ltvFactor: new anchor.BN(0),
    });

    // Pre-deposit funds for withdrawal tests
    await market.deposit({
      user: larry,
      amount: new anchor.BN(1000000000),
      shares: new anchor.BN(0)
    });

    await market.deposit({
      user: lizz,
      amount: new anchor.BN(1000000000),
      shares: new anchor.BN(0)
    });
  });

  it("from a market", async () => {
    const initialBalance: BigInt = await larry.get_quo_balance();
    console.log("initialBalance", initialBalance);

    await market.withdraw({
      user: larry,
      amount: new anchor.BN(500000000),
      shares: new anchor.BN(0)
    });

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(
      marketAccountData.totalShares.toNumber(), 
      1500000000000000 // Original 2000000000000000 - 500000000000000
    );
    assert.equal(
      marketAccountData.totalQuote.toNumber(),
      1500000000 // Original 2000000000 - 500000000
    );

    const larryShares = await market
      .get_user_shares(larry.key.publicKey)
      .get_data();
    assert.equal(
      larryShares.shares.toNumber(), 
      500000000000000 // Original 1000000000000000 - 500000000000000
    );

    const finalBalance: BigInt = await larry.get_quo_balance();
    assert.equal(
      finalBalance - initialBalance, 
      BigInt(500000000)
    );
  });
  
  it("two users withdraw from a market", async () => {
    await market.withdraw({
      user: larry,
      amount: new anchor.BN(500000000),
      shares: new anchor.BN(0)
    });

    await market.withdraw({
      user: lizz,
      amount: new anchor.BN(500000000),
      shares: new anchor.BN(0)
    });

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(
      marketAccountData.totalShares.toNumber(), 
      1000000000000000 // Original 2000000000000000 - 1000000000000000
    );
    assert.equal(
      marketAccountData.totalQuote.toNumber(), 
      1000000000 // Original 2000000000 - 1000000000
    );

    const larrySharesData = await market
      .get_user_shares(larry.key.publicKey)
      .get_data();
    const lizzSharesData = await market
      .get_user_shares(lizz.key.publicKey)
      .get_data();

    assert.equal(larrySharesData.shares.toNumber(), 500000000000000);
    assert.equal(lizzSharesData.shares.toNumber(), 500000000000000);

    assert.equal(
      await larry.get_quo_balance(), 
      BigInt(999500000000)
    );
    assert.equal(
      await lizz.get_quo_balance(), 
      BigInt(999500000000)
    );
  });

  it("fails to withdraw more than deposited", async () => {
    await assert.rejects(
      async () => {
        await market.withdraw({
          user: larry,
          amount: new anchor.BN(2000000000), // More than deposited
          shares: new anchor.BN(0)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6002);
        assert.strictEqual(err.error.errorMessage, 'The user had insufficient balance to do this');
        return true;
      }
    );
  });
});
