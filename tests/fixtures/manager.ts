import { Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AssistantToTheRegionalManager } from "../../target/types/assistant_to_the_regional_manager";
import { BankrunProvider } from "anchor-bankrun";
import { UserFixture, AccountFixture, splAccountFixture, queueAccountFixture} from "./index";
import { COMMITMENT, deriveManagerConfigAccount, deriveMarketConfigAccount, deriveMetadataAccount, deriveMultiMarketConfigs, deriveQueueAccount, MPL_TOKEN_METADATA_PROGRAM_ID } from "../utils";

export class ManagerFixture {
  public program: Program<AssistantToTheRegionalManager>;
  public provider: BankrunProvider;
  public quoteMint: PublicKey;
  public quoteAta: splAccountFixture;
  public shareMint: anchor.Wallet;
  public managerVaultConfigAcc: AccountFixture;
  public queue: AccountFixture;

  public constructor(
    public _program: Program<AssistantToTheRegionalManager>,
    public _provider: BankrunProvider,
    public _quoteMint: PublicKey,
  ) {
    this.program = _program;
    this.provider = _provider;
    this.quoteMint = _quoteMint;
    this.shareMint = new anchor.Wallet(Keypair.generate());
  }

  async create({
    user,
    name,
    symbol,
  }: {
    user: UserFixture;
    name: string;
    symbol: string;
  }): Promise<void> {
    await this.createCustom({
      user,
      name,
      symbol,
      curator: user,
      guardian: user,
      feeRecipient: user,
      skimRecipient: user,
    });
  }

  async createCustom({
    user,
    symbol,
    name,
    curator,
    guardian,
    feeRecipient,
    skimRecipient,
  }: {
    user: UserFixture;
    symbol: string;
    name: string;
    curator: UserFixture;
    guardian: UserFixture;
    feeRecipient: UserFixture;
    skimRecipient: UserFixture;
  }): Promise<void> {

    // set manager config account
    this.managerVaultConfigAcc = new AccountFixture(
      "managerVaultConfig",
      deriveManagerConfigAccount(this.quoteMint, symbol, name, this.program.programId),
      this.program,
    );

    // set vault ata for the manager vault
    this.quoteAta = new splAccountFixture(
      "quoteAta",
      this.get_ata(this.quoteMint),
      this.program,
    );

    this.queue = new queueAccountFixture(
      "queue",
      deriveQueueAccount(this.managerVaultConfigAcc.key, this.program.programId),
      this.program
    );

    await this.program.methods
      .createManager({
        symbol,
        name,
        owner: user.key.publicKey,
        guardian: guardian.key.publicKey,
        feeRecipient: feeRecipient.key.publicKey,
        skimRecipient: skimRecipient.key.publicKey,
        curator: curator.key.publicKey,
        timelock: new anchor.BN(60 * 60 * 24),
        decimalsOffset: 0,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        quoteMint: this.quoteMint,
        shareMint: this.shareMint.publicKey,
        metadataAccount: deriveMetadataAccount(this.shareMint.publicKey, MPL_TOKEN_METADATA_PROGRAM_ID, this.program.programId),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
      })
      .signers([user.key.payer, this.shareMint.payer])
      .rpc();
  }

  async submitCap({
    user,
    marketId,
    supplyCap,
  }: {
    user: UserFixture;
    marketId: PublicKey;
    supplyCap: anchor.BN;
  }): Promise<void> {

    await this.program.methods
      .submitCap({
        marketId,
        supplyCap,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        marketConfig: deriveMarketConfigAccount(this.managerVaultConfigAcc.key, marketId, this.program.programId),
        queue: deriveQueueAccount(this.managerVaultConfigAcc.key, this.program.programId),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async acceptCap({
    user,
    marketId,
  }: {
    user: UserFixture;
    marketId: PublicKey;
  }): Promise<void> {

    await this.program.methods
      .acceptCap({
        marketId,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        marketConfig: deriveMarketConfigAccount(this.managerVaultConfigAcc.key, marketId, this.program.programId),
        queue: deriveQueueAccount(this.managerVaultConfigAcc.key, this.program.programId),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async setSupplyQueue({
    user,
    newSupplyQueue,
  }: {
    user: UserFixture;
    newSupplyQueue: PublicKey[];
  }): Promise<void> {

    await this.program.methods
      .setSupplyQueue({
        newSupplyQueue,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        quoteMint: this.quoteMint,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        // NOTE: remaining accounts are market configs.
      })
      .remainingAccounts(deriveMultiMarketConfigs(this.managerVaultConfigAcc.key, newSupplyQueue, this.program.programId))
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  public get_market_config(marketId: PublicKey): AccountFixture {
    return new AccountFixture(
      "marketConfig",
      deriveMarketConfigAccount(
        this.managerVaultConfigAcc.key,
        marketId,
        this.program.programId
      ),
      this.program
    );
  }
  
  // account related methods
  public get_ata(mint: PublicKey): PublicKey {
    return anchor.utils.token.associatedAddress({
      mint,
      owner: this.managerVaultConfigAcc.key,
    });
  }

}