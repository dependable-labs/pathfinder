import * as anchor from "@coral-xyz/anchor";
import { setupTest} from '../utils';
import { MarketFixture, ControllerFixture, UserFixture } from '../fixtures';
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from 'assert';
import { startAnchor, BankrunProvider } from 'anchor-bankrun';
import { ProgramTestContext } from 'solana-bankrun';

describe("Authority Operations", () => {

  let program: Program<Markets>;
  let provider: BankrunProvider;
  let accounts: any;
  let controller: ControllerFixture;
  let market: MarketFixture;
  let context: ProgramTestContext;
  let larry: UserFixture;

  beforeEach(async () => {
    context = await startAnchor('', [], []);
    provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest(
      provider,
      context.banksClient
    ));

    controller = new ControllerFixture(
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
      context,
      accounts.market,
      accounts.quoteMint,
      controller, // futarchy treasury authority
    );
  });


  it("sets the authority", async () => {

    await market.setAuthority(larry);

    const controllerAccountData = await controller.controllerAcc.get_data();
    assert.equal(controllerAccountData.authority.toBase58(), controller.authority.publicKey.toBase58());

  });

  it("can't set the authority twice", async () => {
    await market.setAuthority(larry);

    await assert.rejects(async () => {
      await market.setAuthority(larry);
    });
  });

});
