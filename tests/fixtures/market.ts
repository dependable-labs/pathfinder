import { PublicKey} from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { AccountFixture } from './account';
import { BankrunProvider } from 'anchor-bankrun';
import { UserFixture } from './user';

export class MarketFixture {
  public marketAcc: AccountFixture;
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public quoteMint: PublicKey;
  public quoteAta: PublicKey;

  public constructor(
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _marketAddress: PublicKey,
    public _quoteMint: PublicKey,
    public _owner: PublicKey
  ) {
    this.marketAcc = new AccountFixture(
      "market",
      _marketAddress,
      _program,
      _provider
    );
    this.program = _program;
    this.provider = _provider;
    this.quoteMint = _quoteMint;
  }

  async create(owner: PublicKey): Promise<void> {

    const PYTH_SOL_USD_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

    await this.program.methods
      .createMarket({
        oracle: PYTH_SOL_USD_ID,
        lltv: new anchor.BN(100),
      })
      .accounts({
        owner,
        market: this.marketAcc.key,
        quoteMint: this.quoteMint,
        vaultAtaQuote: this.get_ata(this.quoteMint),
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  // async addCollateral(accounts: any, oracle: string, cap: anchor.BN, rateFactor: anchor.BN ) {
  //   await this.program.methods
  //     .addCollateral({
  //       oracle,
  //       cap,
  //       rateFactor,
  //     })
  //     .accounts({
  //       authority: accounts.owner,
  //       market: this.marketAcc.key,
  //       collateral: accounts.collateralCustom,
  //       collateralMint: accounts.collateralMint,
  //       associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
  //       tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .rpc();
  // }

  async deposit(user: UserFixture, accounts: any, amount: anchor.BN, shares: anchor.BN) {

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

  // async withdraw(accounts: any, amount: anchor.BN, shares: anchor.BN) {
  //   await this.program.methods
  //     .withdraw({
  //       amount,
  //       shares,
  //     })
  //     .accounts({
  //       user: accounts.owner,
  //       market: this.marketAcc.key,
  //       userShares: accounts.userShares,
  //       quoteMint: this.quoteMint,
  //       vaultAtaQuote: this.quoteAta,
  //       userAtaQuote: accounts.quoteOwnerTokenAccount,
  //       collateralMint: accounts.collateralMint,
  //       tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  //       associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .rpc();
  // }

  // async depositCollateral(accounts: any, amount: anchor.BN) {
  //   await this.program.methods
  //     .depositCollateral({
  //       amount,
  //     })
  //     .accounts({
  //       user: accounts.owner,
  //       market: this.marketAcc.key,
  //       collateral: accounts.collateralCustom,
  //       userShares: accounts.userShares,
  //       collateralMint: accounts.collateralMint,
  //       vaultAtaCollateral: accounts.collateralAta,
  //       userAtaCollateral: accounts.collateralOwnerTokenAccount,
  //       tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  //       associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .rpc();
  // }

  // async borrow(accounts: any, amount: anchor.BN, shares: anchor.BN) {
  //   await this.program.methods
  //     .borrow({
  //       amount,
  //       shares,
  //     })
  //     .accounts({
  //       user: accounts.owner,
  //       market: this.marketAcc.key,
  //       userShares: accounts.userShares,
  //       quoteMint: this.quoteMint,
  //       vaultAtaQuote: this.quoteAta,
  //       userAtaQuote: accounts.quoteOwnerTokenAccount,
  //       collateral: accounts.collateralCustom,
  //       collateralMint: accounts.collateralMint,
  //       tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  //       associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .rpc();
  // }

  public get_ata(mint: PublicKey): PublicKey {
    return anchor.utils.token.associatedAddress({ mint, owner: this.marketAcc.key });
  }

  public get_user_shares(userKey: PublicKey): AccountFixture {
    let userSharesKey = PublicKey.findProgramAddressSync(
      [Buffer.from("market_shares"), this.marketAcc.key.toBuffer(), userKey.toBuffer()],
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
