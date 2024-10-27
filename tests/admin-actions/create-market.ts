import { setupTest} from '../utils';
import { MarketFixture } from '../market-utils';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from 'assert';

describe("Market Operations", () => {

  let program: Program<Markets>;
  let provider: anchor.AnchorProvider;
  let accounts: any;

  before(async () => {

    ({ program, provider, accounts } = await setupTest(
      anchor.workspace.Markets as Program<Markets>,
      anchor.AnchorProvider.env()
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

  it("adds collateral to a market", async () => {

    const market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      accounts.quoteAta,
      accounts.owner
    );

    await market.create(accounts.owner);


  });
});
