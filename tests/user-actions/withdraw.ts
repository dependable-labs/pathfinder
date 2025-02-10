import { TestUtils} from "../utils";
import { MarketFixture, UserFixture } from "../fixtures";
import * as anchor from "@coral-xyz/anchor";
import assert from "assert";

describe("Withdraw", () => {
  let test: TestUtils;
  let market: MarketFixture;
  let larry: UserFixture;
  let lizz: UserFixture;

  beforeEach(async () => {

    test = await TestUtils.create({
      quoteDecimals: 5,
      collateralDecimals: 9,
    });

    larry = await test.createUser( 
      new anchor.BN(1000 * 1e9),
      new anchor.BN(0)
    );

    lizz = await test.createUser( 
      new anchor.BN(1000 * 1e9),
      new anchor.BN(0)
    );

    let futarchy = await test.createUser( 
      new anchor.BN(0),
      new anchor.BN(0)
    );

    market = await test.createMarket({
        symbol: "BONK",
        ltvFactor: new anchor.BN(0),
        price: new anchor.BN(100 * 10 ** 9),
        conf: new anchor.BN(100 / 10 * 10 ** 9),
        expo: -9,
        feeRecipient: futarchy,
        authority: futarchy,
      });

    await market.createAndSetAuthority({ user: larry });

    // Pre-deposit funds for withdrawal tests
    await market.deposit({
      user: larry,
      amount: new anchor.BN(1 * 1e9),
      shares: new anchor.BN(0),
      owner: larry,
    });

    await market.deposit({
      user: lizz,
      amount: new anchor.BN(1 * 1e9),
      shares: new anchor.BN(0),
      owner: lizz,
    });
  });

  it("from a market", async () => {
    const initialBalance: BigInt = await larry.get_quo_balance();

    await market.withdraw({
      user: larry,
      owner: larry,
      recipient: larry,
      amount: new anchor.BN(0.5 * 1e9),
      shares: new anchor.BN(0)
    });

    const marketAccountData = await market.marketAcc.get_data();
    const totalDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(
      marketAccountData.totalShares.toNumber(), 
      1.5 * 1e9 // Original 2000000000000000 - 500000000000000
    );
    assert.equal(
      totalDeposits.toNumber(),
      1.5 * 1e9  // Original 2000000000 - 500000000
    );

    const larryShares = await market
      .get_lender_shares(larry.key.publicKey)
      .get_data();
    assert.equal(
      larryShares.shares.toNumber(), 
      0.5 * 1e9 // Original 1000000000000000 - 500000000000000
    );

    const finalBalance: BigInt = await larry.get_quo_balance();
    assert.equal(
      finalBalance - initialBalance, 
      BigInt(0.5 * 1e9)
    );
  });
  
  it("two users withdraw from a market", async () => {
    await market.withdraw({
      user: larry,
      owner: larry,
      recipient: larry,
      amount: new anchor.BN(0.5 * 1e9),
      shares: new anchor.BN(0)
    });

    await market.withdraw({
      user: lizz,
      owner: lizz,
      recipient: lizz,
      amount: new anchor.BN(0.5 * 1e9),
      shares: new anchor.BN(0)
    });

    const marketAccountData = await market.marketAcc.get_data();
    const totalDeposits = await market.marketAcc.getTotalDeposits();

    assert.equal(
      marketAccountData.totalShares.toNumber(), 
      1 * 1e9 // Original 2000000000000000 - 1000000000000000
    );
    assert.equal(
      totalDeposits.toNumber(), 
      1 * 1e9 // Original 2000000000 - 1000000000
    );

    const larrySharesData = await market
      .get_lender_shares(larry.key.publicKey)
      .get_data();
    const lizzSharesData = await market
      .get_lender_shares(lizz.key.publicKey)
      .get_data();

    assert.equal(larrySharesData.shares.toNumber(), 0.5 * 1e9);
    assert.equal(lizzSharesData.shares.toNumber(), 0.5 * 1e9);

    assert.equal(
      await larry.get_quo_balance(), 
      BigInt(999.5 * 1e9)
    );
    assert.equal(
      await lizz.get_quo_balance(), 
      BigInt(999.5 * 1e9)
    );
  });

  it("fails to withdraw more than deposited", async () => {
    await assert.rejects(
      async () => {
        await market.withdraw({
          user: larry,
          owner: larry,
          recipient: larry,
          amount: new anchor.BN(2 * 1e9), // More than deposited
          shares: new anchor.BN(0)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6010);
        assert.strictEqual(err.error.errorMessage, 'Math Underflow');
        return true;
      }
    );
  });


  it("from a market on behalf of another owner", async () => {
    const initialBalance: BigInt = await larry.get_quo_balance();

    await assert.rejects(
      async () => {
        await market.withdraw({
          user: larry,
          owner: lizz,
          recipient: larry,
          amount: new anchor.BN(0.5 * 1e9),
          shares: new anchor.BN(0)
        });
      },
      (err: anchor.AnchorError) => {
        assert.strictEqual(err.error.errorCode.number, 6014);
        assert.strictEqual(err.error.errorMessage, 'Unauthorized delegate');
        return true;
      }
    );

    // lizz updates her delegate to larry
    await market.updateDelegate({
      user: lizz,
      newDelegate: larry
    });

    await market.withdraw({
      user: larry,
      owner: lizz,
      recipient: larry,
      amount: new anchor.BN(0.5 * 1e9),
      shares: new anchor.BN(0)
    });

    const marketAccountData = await market.marketAcc.get_data();
    const totalDeposits = await market.marketAcc.getTotalDeposits();
    assert.equal(
      marketAccountData.totalShares.toNumber(), 
      1.5 * 1e9 // Original 2000000000000000 - 500000000000000
    );
    assert.equal(
      totalDeposits.toNumber(),
      1.5 * 1e9  // Original 2000000000 - 500000000
    );

    const lizzShares = await market
      .get_lender_shares(lizz.key.publicKey)
      .get_data();
    assert.equal(
      lizzShares.shares.toNumber(), 
      0.5 * 1e9 // Original 1000000000000000 - 500000000000000
    );

    // larry withdraws from the market to himself
    const finalBalance: BigInt = await larry.get_quo_balance();
    assert.equal(
      finalBalance - initialBalance, 
      BigInt(0.5 * 1e9)
    );

    const larryShares = await market
      .get_lender_shares(larry.key.publicKey)
      .get_data();
    assert.equal(
      larryShares.shares.toNumber(), 
      1.0 * 1e9 // Original 1000000000000000 - 500000000000000
    );

    assert.equal(
      await larry.get_quo_balance(), 
      BigInt(999.5 * 1e9)
    );
  });

});
