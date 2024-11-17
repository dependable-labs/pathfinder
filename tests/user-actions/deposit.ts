import { setupTest } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { ProgramTestContext } from "solana-bankrun";
import { BankrunProvider, startAnchor } from "anchor-bankrun";

describe("Deposit", () => {
  let context: ProgramTestContext;
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let accounts: any;
  let controller: ControllerFixture;
  let market: MarketFixture;
  let larry: UserFixture;
  let lizz: UserFixture;

  beforeEach(async () => {
    context = await startAnchor("", [], []);
    provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest({
      provider,
      banks: context.banksClient,
      quoteDecimals: 5,
      collateralDecimals: 9,
    }));

    larry = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await larry.init_and_fund_accounts(
      new anchor.BN(1_000 * 1e5),
      new anchor.BN(0)
    );

    lizz = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await lizz.init_and_fund_accounts(
      new anchor.BN(1_000 * 1e5),
      new anchor.BN(0)
    );

    controller = new ControllerFixture(program, provider);

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller // contains futarchy treasury authority
    );

    await market.setAuthority();
    // add collateral and initialize price
    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(100 * 1e5),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -5
    });

    await market.create({
      collateralSymbol: "BONK",
      debtCap: new anchor.BN(100),
      ltvFactor: new anchor.BN(0),
    });
  });

  it("into a market", async () => {
    await market.deposit({
      user: larry,
      amount: new anchor.BN(1 * 1e5),
      shares: new anchor.BN(0)
    });

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.totalShares.toNumber(), 1_000_000 * 1e5);
    assert.equal(marketAccountData.totalQuote.toNumber(), 1 * 1e5);

    const userSharesAccountData = await market
      .get_user_shares(larry.key.publicKey)
      .get_data();
    assert.equal(userSharesAccountData.shares.toNumber(), 1_000_000 * 1e5);

    assert.equal(await larry.get_quo_balance(), BigInt(999 * 1e5));
  });

  it("two users Deposit into a market", async () => {
    await market.deposit({
      user: larry,
      amount: new anchor.BN(5 * 1e5),
      shares: new anchor.BN(0)
    });

    await market.deposit({
      user: lizz,
      amount: new anchor.BN(5 * 1e5),
      shares: new anchor.BN(0)
    });

    const marketAccountData2 = await market.marketAcc.get_data();
    assert.equal(marketAccountData2.totalShares.toNumber(), 10_000_000 * 1e5);
    assert.equal(marketAccountData2.totalQuote.toNumber(), 10 * 1e5);

    const userSharesAccountData2 = await market
      .get_user_shares(lizz.key.publicKey)
      .get_data();
    assert.equal(userSharesAccountData2.shares.toNumber(), 5_000_000 * 1e5);

    assert.equal(await larry.get_quo_balance(), BigInt(995 * 1e5));
    assert.equal(await lizz.get_quo_balance(), BigInt(995 * 1e5));
  });

  it("nine decimal quote Deposit into a market", async () => {

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
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller // contains futarchy treasury authority
    );

    // // add collateral and initialize price
    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(100 * 1e5),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -5
    });

    await market.create({
      collateralSymbol: "BONK",
      debtCap: new anchor.BN(100),
      ltvFactor: new anchor.BN(0),
    });

    await market.deposit({
      user: larry,
      amount: new anchor.BN(5 * 1e9),
      shares: new anchor.BN(0)
    });

    const marketAccountData2 = await market.marketAcc.get_data();
    assert.equal(marketAccountData2.totalShares.toNumber(), 5_000_000 * 1e9);
    assert.equal(marketAccountData2.totalQuote.toNumber(), 5 * 1e9);

    const userSharesAccountData2 = await market
      .get_user_shares(larry.key.publicKey)
      .get_data();
    assert.equal(userSharesAccountData2.shares.toNumber(), 5_000_000 * 1e9);

    assert.equal(await larry.get_quo_balance(), BigInt(995 * 1e9));
  });
});
