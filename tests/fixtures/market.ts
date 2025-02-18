import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { BankrunProvider } from "anchor-bankrun";
import { CollateralFixture, SupportedCollateral, UserFixture, AccountFixture, marketAccountFixture, splAccountFixture, ControllerFixture, OracleSource } from "./index";
import { deriveMarketAddress } from "../utils";
import { assert } from "chai";
import { IdlInstruction } from "@coral-xyz/anchor/dist/cjs/idl";

export class MarketFixture {
  public marketAcc: marketAccountFixture;
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public quoteMint: PublicKey;
  public quoteAta: splAccountFixture;
  public controller: ControllerFixture;
  public collateral: CollateralFixture;
  public configFeeRecipient: UserFixture;
  public configAuthority: UserFixture;

  public constructor(
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _quoteMint: PublicKey,
    public _collateralMint: PublicKey,
    public _collateralSymbol: SupportedCollateral,
    public _collateral: CollateralFixture,
    public _configFeeRecipient: UserFixture,
    public _configAuthority: UserFixture,
  ) {
    this.collateral = _collateral;

    this.marketAcc = new marketAccountFixture(
      "market",
      deriveMarketAddress(_quoteMint, _collateralMint, this.collateral._ltvFactor, this.collateral.getOracleId(), _program.programId),
      _program,
    );
    this.program = _program;
    this.provider = _provider;
    this.quoteMint = _quoteMint;
    this.quoteAta = new splAccountFixture(
      "quoteAta",
      this.get_ata(this.quoteMint),
      _program,
    );
    this.configFeeRecipient = _configFeeRecipient;
    this.configAuthority = _configAuthority;

  }

  async createAndSetAuthority({
    user,
  }: {
    user: UserFixture;
  }): Promise<void> {
    await this.updateRecipient({
      user: this.configAuthority,
      new_recipient: this.configFeeRecipient,
    });
    await this.updateAuthority({
      user: this.configAuthority,
      new_authority: this.configAuthority,
    });

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

    let source = this.collateral.getOracleSource() === OracleSource.PythPull ? { pythPull: {} } : { switchboardPull: {} }

    await this.program.methods
      .createMarket({
        oracleId: this.collateral.getOracleId(),
        ltvFactor,
        oracleSource: source,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
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

  async deposit({
    user,
    amount,
    shares,
    owner,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    shares: anchor.BN;
    owner: UserFixture;
  }): Promise<void> {

    const instruction = await this.program.methods
      .deposit({
        amount,
        shares,
        owner: owner.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
        market: this.marketAcc.key,
        lenderShares: this.get_lender_shares(owner.key.publicKey).key,
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
    owner,
    recipient,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    shares: anchor.BN;
    owner: UserFixture;
    recipient: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .withdraw({
        amount,
        shares,
        owner: owner.key.publicKey,
        recipient: recipient.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
        recipient: recipient.key.publicKey,
        positionDelegate: this.get_position_delegate(owner.key.publicKey).key,
        market: this.marketAcc.key,
        lenderShares: this.get_lender_shares(owner.key.publicKey).key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        recipientAtaQuote: recipient.get_ata(this.quoteMint),
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
    owner,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    owner: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .depositCollateral({
        amount,
        owner: owner.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
        market: this.marketAcc.key,
        borrowerShares: this.get_borrower_shares(owner.key.publicKey).key,
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
    owner,
    recipient,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    owner: UserFixture;
    recipient: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .withdrawCollateral({
        amount,
        owner: owner.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
        recipient: recipient.key.publicKey,
        positionDelegate: this.get_position_delegate(owner.key.publicKey).key,
        market: this.marketAcc.key,
        borrowerShares: this.get_borrower_shares(owner.key.publicKey).key,
        collateralMint: this.collateral.collateralMint,
        quoteMint: this.quoteMint,
        vaultAtaCollateral: this.get_ata(this.collateral.collateralMint),
        userAtaCollateral: user.get_ata(this.collateral.collateralMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        oracleAi: this.collateral.getOracleAccount(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async borrow({
    user,
    amount,
    shares,
    owner,
    recipient,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    shares: anchor.BN;
    owner: UserFixture;
    recipient: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .borrow({
        amount,
        shares,
        owner: owner.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
        recipient: recipient.key.publicKey,
        positionDelegate: this.get_position_delegate(owner.key.publicKey).key,
        market: this.marketAcc.key,
        borrowerShares: this.get_borrower_shares(owner.key.publicKey).key,
        quoteMint: this.quoteMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        userAtaQuote: user.quoteAta,
        collateralMint: this.collateral.collateralMint,
        vaultAtaCollateral: this.get_ata(this.collateral.collateralMint),
        userAtaCollateral: user.get_ata(this.collateral.collateralMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        oracleAi: this.collateral.getOracleAccount(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async repay({
    user,
    amount,
    shares,
    owner,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    shares: anchor.BN;
    owner: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .repay({
        amount,
        shares,
        owner: owner.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
        market: this.marketAcc.key,
        borrowerShares: this.get_borrower_shares(owner.key.publicKey).key,
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
        config: this.get_config().key,
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
        oracleAi: this.collateral.getOracleAccount(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async withdrawFee({
    user,
    amount,
    shares,
    recipient,
  }: {
    user: UserFixture;
    amount: anchor.BN;
    shares: anchor.BN;
    recipient: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .withdrawFee({
        amount,
        shares,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
        recipient: recipient.key.publicKey,
        market: this.marketAcc.key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        recipientAtaQuote: recipient.get_ata(this.quoteMint),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }


  async updateDelegate({
    user,
    newDelegate,
  }: {
    user: UserFixture;
    newDelegate: UserFixture;
  }): Promise<void> {
    await this.program.methods
      .updateDelegate({
        newDelegate: newDelegate.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async updateFee({
    user,
    feeFactor,
  }: {
    user: UserFixture;
    feeFactor: anchor.BN;
  }): Promise<void> {
    await this.program.methods
      .updateFee({
        newFeeFactor: feeFactor,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async updateRecipient({
    user,
    new_recipient,
  }: {
    user: UserFixture;
    new_recipient: UserFixture;
  }): Promise<void> {
    await this.program.methods
      .updateRecipient({
        newRecipient: new_recipient.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async updateAuthority({
    user,
    new_authority,
  }: {
    user: UserFixture;
    new_authority: UserFixture;
  }): Promise<void> {
    await this.program.methods
      .updateAuthority({
        newAuthority: new_authority.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.get_config().key,
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


  async viewMarketBalances(): Promise<[anchor.BN, anchor.BN, anchor.BN, anchor.BN]> {
    const result = await this.program.methods
      .viewMarketBalances()
      .accounts({
        config: this.get_config().key,
        market: this.marketAcc.key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
      })
      .signers([this.provider.wallet.payer])
      .view();

    return [
      new anchor.BN(result[0].toString()),
      new anchor.BN(result[1].toString()), 
      new anchor.BN(result[2].toString()),
      new anchor.BN(result[3].toString())
    ];
  }

  async viewTotalSupplyAssets(): Promise<anchor.BN> {
    const result = await this.program.methods
      .viewTotalSupplyAssets()
      .accounts({
        config: this.get_config().key,
        market: this.marketAcc.key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
      })
      .signers([this.provider.wallet.payer])
      .view();

    return new anchor.BN(result.toString());
  }

  async viewTotalBorrowAssets(): Promise<anchor.BN> {
    const result = await this.program.methods
      .viewTotalBorrowAssets()
      .accounts({
        config: this.get_config().key,
        market: this.marketAcc.key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
      })
      .signers([this.provider.wallet.payer])
      .view();

    return new anchor.BN(result.toString());
  }

  async viewTotalShares(): Promise<anchor.BN> {
    const result = await this.program.methods
      .viewTotalShares()
      .accounts({
        config: this.get_config().key,
        market: this.marketAcc.key,
        quoteMint: this.quoteMint,
        collateralMint: this.collateral.collateralMint,
      })
      .signers([this.provider.wallet.payer])
      .view();

    return new anchor.BN(result.toString());
  }
  // account related methods
  public get_ata(mint: PublicKey): PublicKey {
    return anchor.utils.token.associatedAddress({
      mint,
      owner: this.marketAcc.key,
    });
  }

  public get_lender_shares(userKey: PublicKey): AccountFixture {
    let lenderSharesKey = PublicKey.findProgramAddressSync(
      [
        Buffer.from("lender_shares"),
        this.marketAcc.key.toBuffer(),
        userKey.toBuffer(),
      ],
      this.program.programId
    )[0];
    return new AccountFixture(
      "lenderShares",
      lenderSharesKey,
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


  public get_position_delegate(userKey: PublicKey): AccountFixture {
    let positionDelegateKey = PublicKey.findProgramAddressSync(
      [
        Buffer.from("delegate"),
        userKey.toBuffer(),
      ],
      this.program.programId
    )[0];
    return new AccountFixture(
      "positionDelegate",
      positionDelegateKey,
      this.program
    );
  }

  public get_config(): AccountFixture {
    let configKey = PublicKey.findProgramAddressSync(
      [
        Buffer.from("config"),
      ],
      this.program.programId
    )[0];
    return new AccountFixture(
      "config",
      configKey,
      this.program
    );
  }
}
