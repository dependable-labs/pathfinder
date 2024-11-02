import * as anchor from "@coral-xyz/anchor";
import { setupTest} from '../utils';
import { MarketFixture, ControllerFixture } from '../fixtures';
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from 'assert';
import { startAnchor, BankrunProvider } from 'anchor-bankrun';
import { UserFixture } from "../fixtures";

describe("Market Operations", () => {

  let program: Program<Markets>;
  let provider: BankrunProvider;
  let market: MarketFixture;
  let accounts: any;
  let larry: UserFixture;

  beforeEach(async () => {
    let context = await startAnchor('', [], []);
    let provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest(
      provider,
      context.banksClient
    ));

    let controller = new ControllerFixture(
      program,
      provider,
      context
    );

    // team member who will set the futarchy authority
    larry = new UserFixture(
      program,
      provider,
      context,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await larry.init_and_fund_accounts(new anchor.BN(999999999999), new anchor.BN(0))

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller, // futarchy treasury authority
    );
    await market.setAuthority(larry);

  });

  it("creates a market", async () => {
    await market.create();

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.quoteMint.toBase58(), accounts.quoteMint.toBase58());
    assert.equal(marketAccountData.quoteMintDecimals, 9, "Quote mint decimals should be 9");
    assert.equal(marketAccountData.totalQuote.toNumber(), 0);
    assert.equal(marketAccountData.totalShares.toNumber(), 0);

  });
});
