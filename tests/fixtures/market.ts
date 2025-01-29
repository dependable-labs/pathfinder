import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { BankrunProvider } from "anchor-bankrun";
import { CollateralFixture, SupportedCollateral, UserFixture, AccountFixture, marketAccountFixture, splAccountFixture, ControllerFixture } from "./index";
import { deriveMarketAddress } from "../utils";
import { assert } from "chai";

export class MarketFixture {
  public marketAcc: marketAccountFixture;
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public quoteMint: PublicKey;
  public quoteAta: splAccountFixture;
  public controller: ControllerFixture;
  public collateral: CollateralFixture;

  public constructor(
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _quoteMint: PublicKey,
    public _collateralMint: PublicKey,
    public _collateralSymbol: SupportedCollateral,
    public _collateral: CollateralFixture,
    public _controller: ControllerFixture,
  ) {
    this.collateral = _collateral;

    this.marketAcc = new marketAccountFixture(
      "market",
      deriveMarketAddress(_quoteMint, _collateralMint, this.collateral._ltvFactor, this.collateral.getOracleId(), _program.programId),
      _program,
    );
    this.program = _program;
    this.provider = _provider;
    this.controller = _controller;
    this.quoteMint = _quoteMint;
    this.quoteAta = new splAccountFixture(
      "quoteAta",
      this.get_ata(this.quoteMint),
      _program,
    );

  }

  // public async addCollateral({
  //   symbol,
  //   collateralAddress,
  //   collateralMint,
  //   price,
  //   conf,
  //   expo
  // } : {
  //   symbol: SupportedCollateral,
  //   collateralAddress: PublicKey,
  //   collateralMint: PublicKey,
  //   price: anchor.BN,
  //   conf: anchor.BN,
  //   expo: number
  // }): Promise<void> {
  //   const collateral = new CollateralFixture(
  //     symbol,
  //     this.program,
  //     this.provider,
  //     collateralAddress,
  //     collateralMint
  //   );
  //   await collateral.initPrice({
  //     price,
  //     conf,
  //     expo
  //   });
  //   // this.collaterals.set(symbol, collateral);
  // }

  // public getCollateral(symbol: string): CollateralFixture | undefined {
  //   return this.collaterals.get(symbol);
  // }

  async setAuthority(): Promise<void> {

    // Futarchy authority is set
    await this.program.methods
      .setAuthority({
        newAuthority: this.controller.authority.publicKey,
      })
      .accounts({
        user: this.provider.wallet.publicKey,
      })
      .signers([this.provider.wallet.payer])
      .rpc();
  }

  async create({
    user,
  }: {
    user: UserFixture;
  }): Promise<void> {
    await this.createCustom({
      user,
      collateralSymbol: this.collateral.symbol,
      ltvFactor: this.collateral._ltvFactor,
      quoteMint: this.quoteMint,
      vaultAtaQuote: this.get_ata(this.quoteMint),
      collateralMint: this.collateral.collateralMint,
      vaultAtaCollateral: this.get_ata(this.collateral.collateralMint),
    });
  }

  async createCustom({
    user,
    collateralSymbol,
    ltvFactor,
    quoteMint,
    vaultAtaQuote,
    collateralMint,
    vaultAtaCollateral,
  }: {
    user: UserFixture;
    collateralSymbol: SupportedCollateral;
    ltvFactor: anchor.BN;
    quoteMint: PublicKey;
    vaultAtaQuote: PublicKey;
    collateralMint: PublicKey;
    vaultAtaCollateral: PublicKey;
  }): Promise<void> {
    await this.program.methods
      .createMarket({
        feedId: this.collateral.getOracleId(),
        ltvFactor,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        quoteMint,
        collateralMint,
        vaultAtaQuote,
        vaultAtaCollateral,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();

    const marketAccountData = await this.marketAcc.get_data();
    assert.equal(marketAccountData.quoteMint.toBase58(), quoteMint.toBase58());
    assert.equal(marketAccountData.collateralMint.toBase58(), collateralMint.toBase58());
    assert.equal(marketAccountData.ltvFactor.toString(), ltvFactor.toString());
  }

  // async update({
  //   symbol,
  //   ltvFactor,
  //   isActive,
  //   overrideAuthority, // Add this parameter
  // }: {
  //   symbol: SupportedCollateral;
  //   ltvFactor: anchor.BN;
  //   isActive: boolean;
  //   overrideAuthority?: UserFixture; // Optional parameter for testing
  // }): Promise<void> {
  //   const collateral = this.getCollateral(symbol);
  //   if (!collateral) {
  //     throw new Error(`Collateral ${symbol} not found`);
  //   }

  //   await this.program.methods
  //   .updateCollateral({
  //     ltvFactor,
  //     isActive,
  //   })
  //   .accounts({
  //     authority: overrideAuthority?.key.publicKey || this.controller.authority.publicKey,
  //     controller: this.controller.controllerAcc.key,
  //     market: this.marketAcc.key,
  //     quoteMint: this.quoteMint,
  //     collateralMint: collateral.collateralMint,
  //     vaultAtaQuote: this.get_ata(this.quoteMint),
  //     vaultAtaCollateral: this.get_ata(collateral.collateralMint),
  //     associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
  //     tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  //     systemProgram: anchor.web3.SystemProgram.programId,
  //   })
  //   .signers([overrideAuthority?.key.payer || this.controller.authority.payer])
  //   .rpc();
  // }

  async deposit({
    user,
    amount,
    shares,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    shares: anchor.BN;
  }): Promise<void> {

    await this.program.methods
      .deposit({
        amount,
        shares,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        userShares: this.get_user_shares(user.key.publicKey).key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        userAtaQuote: user.quoteAta,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async withdraw({
    user,
    amount,
    shares,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    shares: anchor.BN;
  }): Promise<void> {
    await this.program.methods
      .withdraw({
        amount,
        shares,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        userShares: this.get_user_shares(user.key.publicKey).key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        userAtaQuote: user.quoteAta,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async depositCollateral({
    user,
    amount,
  }: {
    user: UserFixture;
    amount: anchor.BN;
  }): Promise<void> {

    await this.program.methods
      .depositCollateral({
        amount,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        borrowerShares: this.get_borrower_shares(user.key.publicKey).key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
        vaultAtaCollateral: this.get_ata(this.collateral.collateralMint),
        userAtaCollateral: user.get_ata(this.collateral.collateralMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async withdrawCollateral({
    user,
    amount,
  }: {
    user: UserFixture;
    amount: anchor.BN;
  }): Promise<void> {

    await this.program.methods
      .withdrawCollateral({
        amount,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        borrowerShares: this.get_borrower_shares(user.key.publicKey).key,
        collateralMint: this.collateral.collateralMint,
        quoteMint: this.quoteMint,
        vaultAtaCollateral: this.get_ata(this.collateral.collateralMint),
        userAtaCollateral: user.get_ata(this.collateral.collateralMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        priceUpdate: this.collateral.getOracleAccount(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async borrow({
    user,
    amount,
    shares,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    shares: anchor.BN;
  }): Promise<void> {
    console.log("inborrow");
    console.log("Borrower Shares:", this.get_borrower_shares(user.key.publicKey).key.toString());

    await this.program.methods
      .borrow({
        amount,
        shares,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        borrowerShares: this.get_borrower_shares(user.key.publicKey).key,
        quoteMint: this.quoteMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        userAtaQuote: user.quoteAta,
        collateralMint: this.collateral.collateralMint,
        vaultAtaCollateral: this.get_ata(this.collateral.collateralMint),
        userAtaCollateral: user.get_ata(this.collateral.collateralMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        priceUpdate: this.collateral.getOracleAccount(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async repay({
    user,
    amount,
    shares,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    shares: anchor.BN;
  }): Promise<void> {

    await this.program.methods
      .repay({
        amount,
        shares,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        borrowerShares: this.get_borrower_shares(user.key.publicKey).key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        userAtaQuote: user.quoteAta,
        vaultAtaCollateral: this.get_ata(this.collateral.collateralMint),
        userAtaCollateral: user.get_ata(this.collateral.collateralMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async liquidate({
    user,
    borrower,
    collateralAmount,
    repayShares,
  }: {
    user: UserFixture;
    borrower: PublicKey;
    collateralAmount: anchor.BN;
    repayShares: anchor.BN;
  }): Promise<void> {

    const tx = await this.program.methods
      .liquidate({
        borrower,
        collateralAmount,
        repayShares,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        borrowerShares: this.get_borrower_shares(borrower).key,
        quoteMint: this.quoteMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        userAtaQuote: user.quoteAta,
        collateralMint: this.collateral.collateralMint,
        vaultAtaCollateral: this.get_ata(this.collateral.collateralMint),
        userAtaCollateral: user.get_ata(this.collateral.collateralMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        priceUpdate: this.collateral.getOracleAccount(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async accrueInterest(): Promise<void> {
    await this.program.methods
      .accrueInterest()
      .accounts({
        market: this.marketAcc.key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
      })
      .rpc();
  }

  // account related methods
  public get_ata(mint: PublicKey): PublicKey {
    return anchor.utils.token.associatedAddress({
      mint,
      owner: this.marketAcc.key,
    });
  }

  public get_user_shares(userKey: PublicKey): AccountFixture {
    let userSharesKey = PublicKey.findProgramAddressSync(
      [
        Buffer.from("market_shares"),
        this.marketAcc.key.toBuffer(),
        userKey.toBuffer(),
      ],
      this.program.programId
    )[0];
    return new AccountFixture(
      "userShares",
      userSharesKey,
      this.program
    );
  }

  public get_borrower_shares(userKey: PublicKey): AccountFixture {

    let borrowerSharesKey = PublicKey.findProgramAddressSync(
      [
        Buffer.from("borrower_shares"),
        this.marketAcc.key.toBuffer(),
        userKey.toBuffer(),
      ],
      this.program.programId
    )[0];

    return new AccountFixture(
      "borrowerShares",
      borrowerSharesKey,
      this.program
    );
  }
}
