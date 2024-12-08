import { setupTest, TimeUtils } from "../utils";
import { MarketFixture, UserFixture, ControllerFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from "assert";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { ProgramTestContext } from "solana-bankrun";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import buffer from 'buffer';

describe("Accrue Interest", () => {
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let context: ProgramTestContext;
  let controller: ControllerFixture;
  let accounts: any;
  let market: MarketFixture;
  let larry: UserFixture; // Lender
  let bob: UserFixture;   // Borrower

  beforeEach(async () => {
    context = await startAnchor("", [], []);
    provider = new BankrunProvider(context);

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
      new anchor.BN(1_000_000 * LAMPORTS_PER_SOL), // Quote tokens for lending
      new anchor.BN(0)
    );

    bob = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );
    await bob.init_and_fund_accounts(
      new anchor.BN(0),
      new anchor.BN(1_000_000 * LAMPORTS_PER_SOL)  // Collateral for borrowing
    );

    controller = new ControllerFixture(program, provider);

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller
    );

    await market.setAuthority();

    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9
    });

    await market.create({
      collateralSymbol: "BONK",
      debtCap: new anchor.BN(1_000 * LAMPORTS_PER_SOL),
      ltvFactor: new anchor.BN(0.8 * 1e9),
    });

    // Setup initial state: deposit, collateralize, and borrow
    await market.deposit({
      user: larry,
      amount: new anchor.BN(1_000 * LAMPORTS_PER_SOL),
      shares: new anchor.BN(0)
    });

    await market.depositCollateral({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(100 * LAMPORTS_PER_SOL)
    });

    await market.borrow({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(500 * LAMPORTS_PER_SOL),
      shares: new anchor.BN(0)
    });

  });

  it("correctly for year", async () => {
    const beforeData = await market.marketAcc.get_data();
    
    // Advance clock by 1 year
    await TimeUtils.moveTimeForward(provider.context, 365 * 24 * 3600);
    
    await market.accrueInterest();
    
    const afterData = await market.marketAcc.get_data();
    
    // Convert to BN and calculate difference
    const difference = afterData.totalBorrowAssets.sub(beforeData.totalBorrowAssets);
    
    // Verify interest accrual (5% on 500_000_000_000 = 25_000_000_000)
    assert.equal(
      difference.toNumber(),
      13_512_691_343 // Expected interest accrual
    );
  });

  it("correctly for year 80% utilization", async () => {

    await market.borrow({
      user: bob,
      symbol: "BONK",
      amount: new anchor.BN(300 * LAMPORTS_PER_SOL), 
      shares: new anchor.BN(0)
    });
    // 800 Debt, 1000 Capacity -> 80% utilization

    const beforeData = await market.marketAcc.get_data();
    
    // Advance clock by 1 year
    await TimeUtils.moveTimeForward(provider.context, 365 * 24 * 3600);
    
    await market.accrueInterest();
    
    const afterData = await market.marketAcc.get_data();
    
    // Convert to BN and calculate difference
    const difference = afterData.totalBorrowAssets.sub(beforeData.totalBorrowAssets);
    
    // Verify interest accrual (5% on 500_000_000_000 = 25_000_000_000)
    assert.equal(
      difference.toNumber(),
      29_877_683_931 // Expected interest accrual
    );
  });

  it("for multiple periods", async () => {
    const beforeData = await market.marketAcc.get_data();
    
    // Advance clock by 2 years  
    await TimeUtils.moveTimeForward(provider.context, 365 * 24 * 2 * 3600);
    
    await market.accrueInterest();

    const afterData = await market.marketAcc.get_data();

    // Convert to BN and calculate difference
    const difference = afterData.totalBorrowAssets.sub(beforeData.totalBorrowAssets);

    assert.equal(
      difference.toNumber(),
      27_390_419_723
    );
  });

  it("updates last accrual timestamp", async () => {
    const beforeData = await market.marketAcc.get_data();
    
    await TimeUtils.moveTimeForward(provider.context, 365 * 24 * 3600);
    
    await market.accrueInterest();

    const afterData = await market.marketAcc.get_data();

    assert.notEqual(
      afterData.lastAccrualTimestamp.toNumber(),
      beforeData.lastAccrualTimestamp.toNumber()
    );
  });
  
  it("correctly for year with six decimal quote token", async () => {

    // initialize this test with six decimal quote token
    ({ program, accounts } = await setupTest({
      provider,
      banks: context.banksClient,
      quoteDecimals: 6,
      collateralDecimals: 9,
    }));

    let lip = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );

    await lip.init_and_fund_accounts(
      new anchor.BN(1_000 * 1e6),
      new anchor.BN(0)
    );

    let barry = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );

    await barry.init_and_fund_accounts(
      new anchor.BN(0),
      new anchor.BN(1_000 * 1e9)
    );

    // let controller = new ControllerFixture(program, provider);

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller // contains futarchy treasury authority
    );

    // add collateral and initialize price
    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(100 * 1e6),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -6
    });

    await market.create({
      collateralSymbol: "BONK",
      debtCap: new anchor.BN(1_000 * 1e6),
      ltvFactor: new anchor.BN(0.8 * 1e6),
    });

    // Setup initial state: deposit, collateralize, and borrow
    await market.deposit({
      user: lip,
      amount: new anchor.BN(1_000 * 1e6),
      shares: new anchor.BN(0)
    });

    await market.depositCollateral({
      user: barry,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });

    await market.borrow({
      user: barry,
      symbol: "BONK",
      amount: new anchor.BN(500 * 1e6),
      shares: new anchor.BN(0)
    });

    const beforeData = await market.marketAcc.get_data();
    
    // Advance clock by 1 year
    await TimeUtils.moveTimeForward(provider.context, 365 * 24 * 3600);
    
    await market.accrueInterest();
    
    const afterData = await market.marketAcc.get_data();
    
    // Convert to BN and calculate difference
    const difference = afterData.totalBorrowAssets.sub(beforeData.totalBorrowAssets);
    
    // Verify interest accrual (5% on 500 * 1e6 = 25 * 1e6)
    assert.equal(
      difference.toNumber(),
      13.512_691 * 1e6 // Expected interest accrual
    );
  });

  it("correctly for year with nine decimal collateral token", async () => {

    // initialize this test with six decimal quote token
    ({ program, accounts } = await setupTest({
      provider,
      banks: context.banksClient,
      quoteDecimals: 9,
      collateralDecimals: 9,
    }));

    let lip = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );

    await lip.init_and_fund_accounts(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    let barry = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );

    await barry.init_and_fund_accounts(
      new anchor.BN(0),
      new anchor.BN(1_000 * 1e9)
    );

    // let controller = new ControllerFixture(program, provider);

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller // contains futarchy treasury authority
    );

    // add collateral and initialize price
    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(100 * 1e9),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -9
    });

    await market.create({
      collateralSymbol: "BONK",
      debtCap: new anchor.BN(1_000 * 1e9),
      ltvFactor: new anchor.BN(0.8 * 1e9),
    });

    // Setup initial state: deposit, collateralize, and borrow
    await market.deposit({
      user: lip,
      amount: new anchor.BN(1_000 * 1e9),
      shares: new anchor.BN(0)
    });

    await market.depositCollateral({
      user: barry,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e9)
    });

    await market.borrow({
      user: barry,
      symbol: "BONK",
      amount: new anchor.BN(500 * 1e9),
      shares: new anchor.BN(0)
    });

    const beforeData = await market.marketAcc.get_data();
    
    // Advance clock by 1 year
    await TimeUtils.moveTimeForward(provider.context, 365 * 24 * 3600);
    
    await market.accrueInterest();
    
    const afterData = await market.marketAcc.get_data();
    
    // Convert to BN and calculate difference
    const difference = afterData.totalBorrowAssets.sub(beforeData.totalBorrowAssets);
    
    // Verify interest accrual (5% on 500 * 1e6 = 25 * 1e6)
    assert.equal(
      difference.toNumber(),
      13.512_691_343 * 1e9 // Expected interest accrual
    );
  });

  it("correctly for year with six decimal collateral token", async () => {

    // initialize this test with six decimal quote token
    ({ program, accounts } = await setupTest({
      provider,
      banks: context.banksClient,
      quoteDecimals: 9,
      collateralDecimals: 6,
    }));

    let lip = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );

    await lip.init_and_fund_accounts(
      new anchor.BN(1_000 * 1e9),
      new anchor.BN(0)
    );

    let barry = new UserFixture(
      provider,
      accounts.quoteMint,
      accounts.collateralMint
    );

    await barry.init_and_fund_accounts(
      new anchor.BN(0),
      new anchor.BN(1_000 * 1e6)
    );

    // let controller = new ControllerFixture(program, provider);

    market = new MarketFixture(
      program,
      provider,
      accounts.market,
      accounts.quoteMint,
      controller // contains futarchy treasury authority
    );

    // add collateral and initialize price
    await market.addCollateral({
      symbol: "BONK",
      collateralAddress: accounts.collateralAcc,
      collateralMint: accounts.collateralMint,
      price: new anchor.BN(100 * 1e6),
      conf: new anchor.BN(100 / 10 * 1e9),
      expo: -6
    });

    await market.create({
      collateralSymbol: "BONK",
      debtCap: new anchor.BN(1_000 * 1e9),
      ltvFactor: new anchor.BN(0.8 * 1e9),
    });

    // Setup initial state: deposit, collateralize, and borrow
    await market.deposit({
      user: lip,
      amount: new anchor.BN(1_000 * 1e9),
      shares: new anchor.BN(0)
    });

    await market.depositCollateral({
      user: barry,
      symbol: "BONK",
      amount: new anchor.BN(100 * 1e6)
    });

    await market.borrow({
      user: barry,
      symbol: "BONK",
      amount: new anchor.BN(500 * 1e9),
      shares: new anchor.BN(0)
    });

    const beforeData = await market.marketAcc.get_data();
    
    // Advance clock by 1 year
    await TimeUtils.moveTimeForward(provider.context, 365 * 24 * 3600);
    
    await market.accrueInterest();
    
    const afterData = await market.marketAcc.get_data();
    
    // Convert to BN and calculate difference
    const difference = afterData.totalBorrowAssets.sub(beforeData.totalBorrowAssets);
    
    // Verify interest accrual (5% on 500 * 1e6 = 25 * 1e6)
    assert.equal(
      difference.toNumber(),
      13.512_691_343 * 1e9 // Expected interest accrual
    );
  });
});


