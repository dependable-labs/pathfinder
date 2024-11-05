import { setupTest, TimeUtils } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { ProgramTestContext } from "solana-bankrun";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("Accrue Interest", () => {
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let context: ProgramTestContext;
  let accounts: any;
  let market: MarketFixture;
  let larry: UserFixture; // Lender
  let bob: UserFixture;   // Borrower

  beforeEach(async () => {
    context = await startAnchor("", [], []);
    let provider = new BankrunProvider(context);

    ({ program, accounts } = await setupTest(provider, context.banksClient));

    larry = new UserFixture(
      program,
      provider,
      context,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await larry.init_and_fund_accounts(
      new anchor.BN(1_000_000 * LAMPORTS_PER_SOL), // Quote tokens for lending
      new anchor.BN(0)
    );

    bob = new UserFixture(
      program,
      provider,
      context,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await bob.init_and_fund_accounts(
      new anchor.BN(0),
      new anchor.BN(1_000_000 * LAMPORTS_PER_SOL)  // Collateral for borrowing
    );

    let controller = new ControllerFixture(program, provider, context);

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller
    );

    await market.setAuthority(larry);
    market.addCollateral(
      "JITO",
      accounts.collateralAcc,
      accounts.collateralMint
    );

    await market.create({
      collateralSymbol: "JITO",
      debtCap: new anchor.BN(1_000 * LAMPORTS_PER_SOL),
      ltvFactor: new anchor.BN(0),
    });

    // Setup initial state: deposit, collateralize, and borrow
    await market.deposit({
      user: larry,
      amount: new anchor.BN(1_000 * LAMPORTS_PER_SOL),
      shares: new anchor.BN(0)
    });

    await market.depositCollateral({
      user: bob,
      symbol: "JITO",
      amount: new anchor.BN(100 * LAMPORTS_PER_SOL)
    });

    await market.borrow({
      user: bob,
      symbol: "JITO",
      amount: new anchor.BN(500 * LAMPORTS_PER_SOL),
      shares: new anchor.BN(0)
    });
  });

  it("accrues interest correctly", async () => {
    const beforeData = await market.marketAcc.get_data();
    
    // Advance clock by 1 year
    await TimeUtils.moveTimeForward(context, 365 * 24 * 3600);
    
    await market.accrueInterest();
    
    const afterData = await market.marketAcc.get_data();
    
    // Convert to BN and calculate difference
    const difference = afterData.totalBorrowAssets.sub(beforeData.totalBorrowAssets);
    
    // Verify interest accrual (5% on 500_000_000_000 = 25_000_000_000)
    assert.equal(
      difference.toNumber(),
      25_000_000_000 // Expected interest accrual
    );
  });

  it("accrues interest for multiple periods", async () => {
    const beforeData = await market.marketAcc.get_data();
    
    // Advance clock by 2 years  
    await TimeUtils.moveTimeForward(context, 365 * 24 * 2 * 3600);
    
    await market.accrueInterest();

    const afterData = await market.marketAcc.get_data();

    // Convert to BN and calculate difference
    const difference = afterData.totalBorrowAssets.sub(beforeData.totalBorrowAssets);

    // Verify interest accrual (5% on 500_000_000_000 = 50_000_000_000)
    assert.equal(
      difference.toNumber(),
      50_000_000_000
    );
  });

  it("updates last accrual timestamp", async () => {
    const beforeData = await market.marketAcc.get_data();
    
    await TimeUtils.moveTimeForward(context, 365 * 24 * 3600);
    
    await market.accrueInterest();

    const afterData = await market.marketAcc.get_data();

    assert.notEqual(
      afterData.lastAccrualTimestamp.toNumber(),
      beforeData.lastAccrualTimestamp.toNumber()
    );
  });
});
