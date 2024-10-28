import * as anchor from "@coral-xyz/anchor";
import { setupTest} from '../utils';
import { MarketFixture } from '../fixtures/market';
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from 'assert';
import { startAnchor, BankrunProvider } from 'anchor-bankrun';

describe("Market Operations", () => {

  let program: Program<Markets>;
  let provider: BankrunProvider;
  let accounts: any;

  before(async () => {
    let context = await startAnchor('', [], []);
    let provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest(
      provider,
      context.banksClient
    ));
  });


  it("creates a market", async () => {

    const market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      accounts.quoteAta,
      accounts.owner
    );
    await market.create(accounts.owner);

    const marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.quoteMint.toBase58(), accounts.quoteMint.toBase58());
    assert.equal(marketAccountData.quoteMintDecimals, 9, "Quote mint decimals should be 9");
    assert.equal(marketAccountData.totalQuote.toNumber(), 0);
    assert.equal(marketAccountData.totalShares.toNumber(), 0);

  });

  // it("adds collateral to a market", async () => {

  //   const market = new MarketFixture(
  //     program,
  //     provider,
  //     accounts.market,
  //     accounts.quoteMint,
  //     accounts.quoteAta,
  //     accounts.owner
  //   );

  //   await market.create(accounts.owner);


  // });
});
