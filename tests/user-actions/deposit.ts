import { setupTest} from '../utils';
import { MarketFixture, UserFixture, ControllerFixture } from '../fixtures';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from 'assert';
import { BankrunProvider, startAnchor } from 'anchor-bankrun';

describe("User Deposit", () => {
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let accounts: any;
  let market: MarketFixture;
  let larry: UserFixture;
  let lizz: UserFixture;

  beforeEach(async () => {
    let context = await startAnchor('', [], []);
    let provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest(
      provider,
      context.banksClient
    ));

    larry = new UserFixture(
      program,
      provider,
      context,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await larry.init_and_fund_accounts(new anchor.BN(1000000000000), new anchor.BN(0))

    lizz = new UserFixture(
      program,
      provider,
      context,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await lizz.init_and_fund_accounts(new anchor.BN(1000000000000), new anchor.BN(0))

    let controller = new ControllerFixture(
      program,
      provider,
      context
    );

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller, // contains futarchy treasury authority
    );

    await market.setAuthority(larry);
    await market.create();
  });


  it("deposits into a market", async () => {

    await market.deposit(
      larry,
      accounts,
      new anchor.BN(1000000000),
      new anchor.BN(0)
    );

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.totalShares.toNumber(), 1000000000000000); assert.equal(marketAccountData.totalQuote.toNumber(), 1000000000);

    const userSharesAccountData = await market.get_user_shares(larry.key.publicKey).get_data();
    assert.equal(userSharesAccountData.shares.toNumber(), 1000000000000000);

    assert.equal(await larry.get_quo_balance(), BigInt(999000000000));

  });

  it("two users deposit into a market", async () => {

    await market.deposit(
      larry,
      accounts,
      new anchor.BN(500000000),
      new anchor.BN(0)
    );

    await market.deposit(
      lizz,
      accounts,
      new anchor.BN(500000000),
      new anchor.BN(0)
    );

    const marketAccountData2 = await market.marketAcc.get_data();
    assert.equal(marketAccountData2.totalShares.toNumber(), 1000000000000000);
    assert.equal(marketAccountData2.totalQuote.toNumber(), 1000000000);

    const userSharesAccountData2 = await market.get_user_shares(lizz.key.publicKey).get_data();
    assert.equal(userSharesAccountData2.shares.toNumber(), 500000000000000);

    assert.equal(await larry.get_quo_balance(), BigInt(999500000000));
    assert.equal(await lizz.get_quo_balance(), BigInt(999500000000));

  });
});



