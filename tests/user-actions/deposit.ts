import { setupTest} from '../utils';
import { MarketFixture } from '../market-utils';
import { AccountFixture } from '../account-utils';
import { UserFixture } from '../user-utils';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from 'assert';

describe("User Deposit", () => {

  let program: Program<Markets>;
  let provider: anchor.AnchorProvider;
  let accounts: any;
  let market: MarketFixture;
  let larry: UserFixture;
  // let lizz: AccountFixture;

  before(async () => {

    ({ program, provider, accounts } = await setupTest(
      anchor.workspace.Markets as Program<Markets>,
      anchor.AnchorProvider.env()
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

    // larry = new UserFixture(
    //   accounts.user,
    //   program,
    //   provider,
    //   accounts.quoteMint,
    //   accounts.collateralMint
    // );

    // await larry.init_accounts()
  });



  it("deposits into a market", async () => {

//     // await market.deposit(accounts.user, new anchor.BN(1000000000), new anchor.BN(1000000000));

//     // const marketAccountData = await market.marketAcc.get_data();
//     // assert.equal(marketAccountData.totalShares.toNumber(), 1000000000);
//     // assert.equal(marketAccountData.totalQuote.toNumber(), 1000000000);

//     // const userSharesAccountData = await user.get_data();

  });
// });



});

