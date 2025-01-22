import * as anchor from "@coral-xyz/anchor";
import { setupTest } from '../utils';
import { ControllerFixture, MarketFixture} from '../fixtures';
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import assert from 'assert';
import { startAnchor, BankrunProvider } from 'anchor-bankrun';
import { UserFixture } from "../fixtures";
import { createMint } from "spl-token-bankrun";
import { ProgramTestContext } from 'solana-bankrun';

describe("Create Market Operations", () => {
  let context: ProgramTestContext;
  let program: Program<Markets>;
  let provider: BankrunProvider;
  let market: MarketFixture;
  let accounts: any;
  let larry: UserFixture;

  beforeEach(async () => {
    context = await startAnchor('', [], []);
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

    await market.addCollateral({
      symbol: "META",
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
    assert.equal(marketAccountData.totalShares.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowAssets.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowShares.toNumber(), 0);
  });

  it("adds second collateral to existing market", async () => {
    await market.create({
      collateralSymbol: "BONK",
      ltvFactor: new anchor.BN(0),
    });

    let marketAccountData = await market.marketAcc.get_data();
    assert.equal(marketAccountData.quoteMint.toBase58(), accounts.quoteMint.toBase58());
    assert.equal(marketAccountData.quoteMintDecimals, 9, "Quote mint decimals should be 9");
    assert.equal(marketAccountData.totalShares.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowAssets.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowShares.toNumber(), 0);

    const bonkCollateralAccount = await market.getCollateral("BONK").collateralAcc.get_data();
    assert.equal(bonkCollateralAccount.collateralMint.toBase58(), accounts.collateralMint.toBase58());
    assert.equal(bonkCollateralAccount.collateralMintDecimals, 9, "Collateral mint decimals should be 9");
    assert.equal(bonkCollateralAccount.totalCollateral.toNumber(), 0);
    assert.equal(bonkCollateralAccount.ltvFactor.toNumber(), 0);
    assert.equal(bonkCollateralAccount.lastActiveTimestamp.toNumber(), 0);


    const newCollateralMint = await createMint(
      context.banksClient,
      provider.wallet.payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      9
    );

    await market.createCustom({
      collateralSymbol: "META",
      ltvFactor: new anchor.BN(0),
      quoteMint: accounts.quoteMint,
      vaultAtaQuote: market.get_ata(accounts.quoteMint),
      collateralMint: newCollateralMint,
      vaultAtaCollateral: market.get_ata(newCollateralMint),
    });

    marketAccountData = await market.marketAcc.get_data();

    assert.equal(marketAccountData.quoteMint.toBase58(), accounts.quoteMint.toBase58());
    assert.equal(marketAccountData.quoteMintDecimals, 9, "Quote mint decimals should be 9");
    assert.equal(marketAccountData.totalShares.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowAssets.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowShares.toNumber(), 0);

    let metaCollateralAccount = await market.getCollateral("META").collateralAcc.get_data();
    assert.equal(metaCollateralAccount.collateralMintDecimals, 9, "Collateral mint decimals should be 9");
    assert.equal(metaCollateralAccount.totalCollateral.toNumber(), 0);
    assert.equal(metaCollateralAccount.ltvFactor.toNumber(), 0);
    assert.equal(metaCollateralAccount.lastActiveTimestamp.toNumber(), 0);

  });

  it("fails to create a duplicate market", async () => {
    await market.create({
      collateralSymbol: "BONK",
      ltvFactor: new anchor.BN(0),
    });

    const marketAccountData = await market.marketAcc.get_data();

    assert.equal(marketAccountData.quoteMint.toBase58(), accounts.quoteMint.toBase58());
    assert.equal(marketAccountData.quoteMintDecimals, 9, "Quote mint decimals should be 9");
    assert.equal(marketAccountData.totalShares.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowAssets.toNumber(), 0);
    assert.equal(marketAccountData.totalBorrowShares.toNumber(), 0);

    await assert.rejects(
      async () => {
        await market.create({
          collateralSymbol: "BONK",
          ltvFactor: new anchor.BN(0),
        });
      },
      (err: anchor.AnchorError) => {
        // errors with account already in use
        return true;
      },
      "Expected update to fail when called by non-authority"
    );

  });

  it("fails to create a market where the collateral mint is the same as the quote mint", async () => {

    await assert.rejects(
      async () => {
        await market.createCustom({
          collateralSymbol: "BONK",
          ltvFactor: new anchor.BN(0),
          quoteMint: accounts.quoteMint,
          vaultAtaQuote: market.get_ata(accounts.quoteMint),
          collateralMint: accounts.quoteMint,
          vaultAtaCollateral: market.get_ata(accounts.quoteMint),
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 2003); // Updated error code
        assert.strictEqual(err.error.errorMessage, 'A raw constraint was violated'); // Updated error message
        return true;
      },
      "Expected update to fail when called by non-authority"
    );

    await assert.rejects(
      async () => {
        await market.marketAcc.get_data();
      },
      (err: anchor.AnchorError) => {
        return true;
      },
      "Expected market account to not exist"
    );
  });
});
