import { setupTest} from '../utils';
import { MarketFixture, UserFixture } from '../fixtures';
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

  before(async () => {
    let context = await startAnchor('', [], []);
    let provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest(
      provider,
      context.banksClient
    ));

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      accounts.quoteAta,
      accounts.owner
    );
    await market.create(accounts.owner);

    larry = new UserFixture(
      accounts.owner,
      program,
      provider,
      context.banksClient,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await larry.init_and_fund_accounts(new anchor.BN(1000000000000), new anchor.BN(0))
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

    const userSharesAccountData = await market.get_user_shares(larry.key);
    assert.equal(userSharesAccountData.toBase58(), accounts.userShares.toBase58());

  });
});



