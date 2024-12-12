import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { BankrunProvider } from "anchor-bankrun";
import { CollateralFixture, SupportedCollateral, UserFixture, AccountFixture, ControllerFixture } from "./index";

export class MarketFixture {
  public marketAcc: AccountFixture;
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public quoteMint: PublicKey;
  public quoteAta: PublicKey;
  public controller: ControllerFixture;
  public collaterals: Map<string, CollateralFixture>;

  public constructor(
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _marketAddress: PublicKey,
    public _quoteMint: PublicKey,
    public _controller: ControllerFixture
  ) {
    this.marketAcc = new AccountFixture(
      "market",
      _marketAddress,
      _program,
    );
    this.program = _program;
    this.provider = _provider;
    this.controller = _controller;
    this.quoteMint = _quoteMint;

    this.collaterals = new Map<string, CollateralFixture>();
  }

  public async addCollateral({
    symbol,
    collateralAddress,
    collateralMint,
    price,
    conf,
    expo
  } : {
    symbol: SupportedCollateral,
    collateralAddress: PublicKey,
    collateralMint: PublicKey,
    price: anchor.BN,
    conf: anchor.BN,
    expo: number
  }): Promise<void> {
    const collateral = new CollateralFixture(
      symbol,
      this.program,
      this.provider,
      collateralAddress,
      collateralMint
    );
    await collateral.initPrice({
      price,
      conf,
      expo
    });
    this.collaterals.set(symbol, collateral);
  }

  public getCollateral(symbol: string): CollateralFixture | undefined {
    return this.collaterals.get(symbol);
  }

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
    collateralSymbol,
    ltvFactor,
  }: {
    collateralSymbol: SupportedCollateral;
    ltvFactor: anchor.BN;
  }): Promise<void> {
    const collateral = this.getCollateral(collateralSymbol);
    if (!collateral) {
      throw new Error(`Collateral ${collateralSymbol} not found`);
    }

    await this.program.methods
      .createMarket({
        feedId: collateral.getOracleId(),
        ltvFactor,
      })
      .accounts({
        authority: this.controller.authority.publicKey,
        controller: this.controller.controllerAcc.key,
        market: this.marketAcc.key,
        quoteMint: this.quoteMint,
        collateralMint: collateral.collateralMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        vaultAtaCollateral: this.get_ata(collateral.collateralMint),
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([this.controller.authority.payer])
      .rpc();
  }

  async update({
    collateralSymbol,
    ltvFactor,
    overrideAuthority, // Add this parameter
  }: {
    collateralSymbol: SupportedCollateral;
    ltvFactor: anchor.BN;
    overrideAuthority?: UserFixture; // Optional parameter for testing
  }): Promise<void> {
    const collateral = this.getCollateral(collateralSymbol);
    if (!collateral) {
      throw new Error(`Collateral ${collateralSymbol} not found`);
    }

    await this.program.methods
    .updateMarket({
      ltvFactor,
    })
    .accounts({
      authority: overrideAuthority?.key.publicKey || this.controller.authority.publicKey,
      controller: this.controller.controllerAcc.key,
      market: this.marketAcc.key,
      quoteMint: this.quoteMint,
      collateralMint: collateral.collateralMint,
      vaultAtaQuote: this.get_ata(this.quoteMint),
      vaultAtaCollateral: this.get_ata(collateral.collateralMint),
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([overrideAuthority?.key.payer || this.controller.authority.payer])
    .rpc();
  }

  async restrictCollateral(
    collateralSymbol: SupportedCollateral,
    overrideAuthority?: UserFixture
  ): Promise<void> {
    const collateral = this.getCollateral(collateralSymbol);
    if (!collateral) {
      throw new Error(`Collateral ${collateralSymbol} not found`);
    }

    await this.program.methods
    .restrictCollateral()
    .accounts({
      authority: overrideAuthority?.key.publicKey || this.controller.authority.publicKey,
      market: this.marketAcc.key,
      controller: this.controller.controllerAcc.key,
      quoteMint: this.quoteMint,
      collateralMint: collateral.collateralMint,
      collateral: collateral.collateralAcc.key,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([overrideAuthority?.key.payer || this.controller.authority.payer])
    .rpc();
  }

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
    symbol,
    amount,
  }: {
    user: UserFixture;
    symbol: string;
    amount: anchor.BN;
  }): Promise<void> {
    const collateral = this.getCollateral(symbol);
    if (!collateral) {
      throw new Error(`Collateral ${symbol} not found`);
    }

    await this.program.methods
      .depositCollateral({
        amount,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        collateral: collateral.collateralAcc.key,
        userShares: this.get_user_shares(user.key.publicKey).key,
        borrowerShares: collateral.get_borrower_shares(user.key.publicKey).key,
        collateralMint: collateral.collateralMint,
        vaultAtaCollateral: this.get_ata(collateral.collateralMint),
        userAtaCollateral: user.get_ata(collateral.collateralMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async withdrawCollateral({
    user,
    symbol,
    amount,
  }: {
    user: UserFixture;
    symbol: string;
    amount: anchor.BN;
  }): Promise<void> {
    const collateral = this.getCollateral(symbol);
    if (!collateral) {
      throw new Error(`Collateral ${symbol} not found`);
    }

    await this.program.methods
      .withdrawCollateral({
        amount,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        collateral: collateral.collateralAcc.key,
        borrowerShares: collateral.get_borrower_shares(user.key.publicKey).key,
        collateralMint: collateral.collateralMint,
        vaultAtaCollateral: this.get_ata(collateral.collateralMint),
        userAtaCollateral: user.get_ata(collateral.collateralMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        priceUpdate: collateral.getOracleAccount(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async borrow({
    user,
    symbol,
    amount,
    shares,
  }: {
    user: UserFixture;
    symbol: string;
    amount: anchor.BN;
    shares: anchor.BN;
  }): Promise<void> {
    const collateral = this.getCollateral(symbol);
    if (!collateral) {
      throw new Error(`Collateral ${symbol} not found`);
    }

    await this.program.methods
      .borrow({
        amount,
        shares,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        borrowerShares: collateral.get_borrower_shares(user.key.publicKey).key,
        quoteMint: this.quoteMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        userAtaQuote: user.quoteAta,
        collateral: collateral.collateralAcc.key,
        collateralMint: collateral.collateralMint,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        priceUpdate: collateral.getOracleAccount(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async repay({
    user,
    symbol,
    amount,
    shares,
  }: {
    user: UserFixture;
    symbol: string;
    amount: anchor.BN;
    shares: anchor.BN;
  }): Promise<void> {
    const collateral = this.getCollateral(symbol);

    if (!collateral) {
      throw new Error(`Collateral ${symbol} not found`);
    }

    await this.program.methods
      .repay({
        amount,
        shares,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        borrowerShares: collateral.get_borrower_shares(user.key.publicKey).key,
        quoteMint: this.quoteMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        userAtaQuote: user.quoteAta,
        collateral: collateral.collateralAcc.key,
        collateralMint: collateral.collateralMint,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async liquidate({
    user,
    symbol,
    borrower,
    collateralAmount,
    repayShares,
  }: {
    user: UserFixture;
    symbol: string;
    borrower: PublicKey;
    collateralAmount: anchor.BN;
    repayShares: anchor.BN;
  }): Promise<void> {
    const collateral = this.getCollateral(symbol);
    if (!collateral) {
      throw new Error(`Collateral ${symbol} not found`);
    }

    console.log("borrower_shares", collateral.get_borrower_shares(borrower).key);

    const tx = await this.program.methods
      .liquidate({
        borrower,
        collateralAmount,
        repayShares,
      })
      .accounts({
        user: user.key.publicKey,
        market: this.marketAcc.key,
        borrowerShares: collateral.get_borrower_shares(borrower).key,
        quoteMint: this.quoteMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        userAtaQuote: user.quoteAta,
        collateral: collateral.collateralAcc.key,
        collateralMint: collateral.collateralMint,
        vaultAtaCollateral: this.get_ata(collateral.collateralMint),
        userAtaCollateral: user.get_ata(collateral.collateralMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        priceUpdate: collateral.getOracleAccount(),
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
        systemProgram: anchor.web3.SystemProgram.programId,
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

  public async sharesToAssets(shares: anchor.BN): Promise<anchor.BN> {
    const marketData = await this.marketAcc.get_data();
    
    // If no shares exist, return 0
    if (marketData.totalBorrowShares.eq(new anchor.BN(0))) {
      return new anchor.BN(0);
    }

    // Use the on-chain to_assets_up method to calculate assets from shares
    return await this.program.methods
      .toAssetsUp(shares, marketData.totalBorrowAssets, marketData.totalBorrowShares)
      .view();
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
}
