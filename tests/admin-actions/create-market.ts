import * as anchor from "@coral-xyz/anchor";
import { setupTest} from '../utils';
import { ControllerFixture, MarketFixture} from '../fixtures';
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from 'assert';
import { startAnchor, BankrunProvider } from 'anchor-bankrun';
import { UserFixture } from "../fixtures";
describe("Create Market Operations", () => {

  let program: Program<Markets>;
  let provider: BankrunProvider;
  let market: MarketFixture;
  let accounts: any;
  let larry: UserFixture;

  beforeEach(async () => {
    let context = await startAnchor('', [], []);
    provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest({
      provider,
      banks: context.banksClient,
      quoteDecimals: 9,
      collateralDecimals: 9,
    }));

    let controller = new ControllerFixture(
      program,
      provider
    );

    // team member who will set the futarchy authority
    larry = new UserFixture(
      provider,
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
    await market.setAuthority();

    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(100 * 10 ** 9),
      conf: new anchor.BN(100 / 10 * 10 ** 9),
      expo: -9
    });
  });

  it("creates a market", async () => {
    await market.create({
      collateralSymbol: "BONK",
      ltvFactor: new anchor.BN(0),
    });

    const marketAccountData = await market.marketAcc.get_data();

    assert.equal(marketAccountData.quoteMint.toBase58(), accounts.quoteMint.toBase58());
    assert.equal(marketAccountData.quoteMintDecimals, 9, "Quote mint decimals should be 9");
    assert.equal(marketAccountData.totalQuote.toNumber(), 0);
    assert.equal(marketAccountData.totalShares.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowAssets.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowShares.toNumber(), 0);
  });
});
