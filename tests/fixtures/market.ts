import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { AccountFixture } from "./account";
import { BankrunProvider } from "anchor-bankrun";
import { ProgramTestContext } from "solana-bankrun";
import { UserFixture } from "./user";
import { ControllerFixture } from "./controller";
import { CollateralFixture, SupportedCollateral } from "./collateral";

import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { Price } from "@pythnetwork/price-service-client";

export class MarketFixture {
  public marketAcc: AccountFixture;
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public context: ProgramTestContext;
  public quoteMint: PublicKey;
  public quoteAta: PublicKey;
  public controller: ControllerFixture;
  public collaterals: Map<string, CollateralFixture>;

  public constructor(
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _context: ProgramTestContext,
    public _marketAddress: PublicKey,
    public _quoteMint: PublicKey,
    public _controller: ControllerFixture
  ) {
    this.marketAcc = new AccountFixture(
      "market",
      _marketAddress,
      _program,
      _provider
    );
    this.program = _program;
    this.provider = _provider;
    this.context = _context;
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
      this.program,
      this.provider,
      this.context,
      collateralAddress,
      collateralMint
    );
    collateral.setSymbol(symbol);
    this.collaterals.set(symbol, collateral);
    await this.collaterals.get(symbol).initPrice({
      price,
      conf,
      expo
    });
  }

  public getCollateral(symbol: string): CollateralFixture | undefined {
    return this.collaterals.get(symbol);
  }

  async setAuthority(user: UserFixture): Promise<void> {
    await this.program.methods
      .setAuthority({
        newAuthority: this.controller.authority.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async create({
    collateralSymbol,
    debtCap,
    ltvFactor,
  }: {
    collateralSymbol: SupportedCollateral;
    debtCap: anchor.BN;
    ltvFactor: anchor.BN;
  }): Promise<void> {
    const collateral = this.getCollateral(collateralSymbol);
    if (!collateral) {
      throw new Error(`Collateral ${collateralSymbol} not found`);
    }

    await this.program.methods
      .createMarket({
        feedId: collateral.getOracleId(),
        debtCap,
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
        // priceUpdate: collateral.getOracleAccount(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([this.controller.authority.payer])
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
        userShares: this.get_user_shares(user.key.publicKey).key,
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
      this.program,
      this.provider
    );
  }
}
