import { Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AssistantToTheRegionalManager } from "../../target/types/assistant_to_the_regional_manager";
import { BankrunProvider } from "anchor-bankrun";
import { UserFixture, AccountFixture, splAccountFixture, queueAccountFixture, MarketFixture} from "./index";
import {
  COMMITMENT,
  deriveManagerConfigAccount,
  deriveMarketConfigAccount,
  deriveMetadataAccount,
  deriveMultiMarketConfigs,
  deriveQueueAccount,
  deriveAllocatorAccount,
  MPL_TOKEN_METADATA_PROGRAM_ID,
  ONE_DAY_TIMELOCK,
  deriveMarketAddress,
  PATHFINDER_PROGRAM_ID,
  ASSISTANT_TO_THE_REGIONAL_MANAGER_PROGRAM_ID,
} from "../utils";

export class ManagerFixture {
  public program: Program<AssistantToTheRegionalManager>;
  public provider: BankrunProvider;
  public quoteMint: PublicKey;
  public market: MarketFixture;
  public quoteAta: splAccountFixture;
  public sharesMint: anchor.Wallet;
  public managerVaultConfigAcc: AccountFixture;
  public allocator: AccountFixture;
  public queue: queueAccountFixture;
  public markets: MarketFixture[];

  public constructor(
    public _program: Program<AssistantToTheRegionalManager>,
    public _provider: BankrunProvider,
    public _quoteMint: PublicKey,
    public _markets: MarketFixture[],
  ) {
    this.program = _program;
    this.provider = _provider;
    this.quoteMint = _quoteMint;
    this.sharesMint = new anchor.Wallet(Keypair.generate());
    this.markets = _markets;
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
      owner: user,
      allocator: user,
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
    owner,
    allocator,
    curator,
    guardian,
    feeRecipient,
    skimRecipient,
  }: {
    user: UserFixture;
    symbol: string;
    name: string;
    owner: UserFixture;
    allocator: UserFixture;
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
      "queueState",
      deriveQueueAccount(this.managerVaultConfigAcc.key, this.program.programId),
      this.program
    );

    await this.program.methods
      .createManager({
        symbol,
        name,
        owner: owner.key.publicKey,
        guardian: guardian.key.publicKey,
        allocator: allocator.key.publicKey,
        feeRecipient: feeRecipient.key.publicKey,
        skimRecipient: skimRecipient.key.publicKey,
        curator: curator.key.publicKey,
        timelock: ONE_DAY_TIMELOCK,
        decimalsOffset: 0,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        quoteMint: this.quoteMint,
        sharesMint: this.sharesMint.publicKey,
        queue: this.queue.key,
        metadataAccount: deriveMetadataAccount(this.sharesMint.publicKey, MPL_TOKEN_METADATA_PROGRAM_ID, this.program.programId),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
      })
      .signers([user.key.payer, this.sharesMint.payer])
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
        market: this.get_market(marketId).marketAcc.key,
        marketConfig: this.get_market_config(marketId).key,
        queue: this.queue.key,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT); 
    
  }

  async submitCapCustom({
    user,
    marketId,
    supplyCap,
    market,
  }: {
    user: UserFixture;
    marketId: PublicKey;
    supplyCap: anchor.BN;
    market: PublicKey;
  }): Promise<void> {

    await this.program.methods
      .submitCap({
        marketId,
        supplyCap,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        market: market,
        marketConfig: this.get_market_config(marketId).key,
        queue: this.queue.key,
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
        marketConfig: this.get_market_config(marketId).key,
        queue: this.queue.key,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async revokePendingCap({
    user,
    marketId,
  }: {
    user: UserFixture;
    marketId: PublicKey;
  }): Promise<void> {

    await this.program.methods
      .revokePendingCap({
        marketId,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        marketConfig: this.get_market_config(marketId).key,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async submitMarketRemoval({
    user,
    marketId,
  }: {
    user: UserFixture;
    marketId: PublicKey;
  }): Promise<void> {

    await this.program.methods
      .submitMarketRemoval({
        marketId,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        marketConfig: this.get_market_config(marketId).key,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async setSupplyQueue({
    user,
    marketIds,
  }: {
    user: UserFixture;
      marketIds: PublicKey[];
  }): Promise<void> {

    await this.program.methods
      .setSupplyQueue({
        marketIds,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        quoteMint: this.quoteMint,
        queue: deriveQueueAccount(this.managerVaultConfigAcc.key, this.program.programId),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        // NOTE: remaining accounts are market configs.
      })
      .remainingAccounts(deriveMultiMarketConfigs(this.managerVaultConfigAcc.key, marketIds, this.program.programId))
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async reorderWithdrawQueue({
    user,
    marketIds,
  }: {
    user: UserFixture;
    marketIds: PublicKey[];
  }): Promise<void> {

    await this.program.methods
      .reorderWithdrawQueue({
        marketIds,
      })
      .accounts({
        user: user.key.publicKey,
        allocator: (await this.get_allocator(user.key.publicKey))?.key || null,
        config: this.managerVaultConfigAcc.key,
        quoteMint: this.quoteMint,
        queue: this.queue.key,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async removeFromWithdrawQueue({
    user,
    marketId,
  }: {
    user: UserFixture;
    marketId: PublicKey;
  }): Promise<void> {

    const market = this.get_market(marketId);

    await this.program.methods
      .removeFromWithdrawQueue({
        marketId,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        allocator: (await this.get_allocator(user.key.publicKey))?.key || null,
        marketConfig: this.get_market_config(marketId).key,
        quoteMint: this.quoteMint,
        queue: this.queue.key,
        lenderShares: null,
        // TODO: test once deposits are functional
        // lenderShares: market.get_lender_shares(ASSISTANT_TO_THE_REGIONAL_MANAGER_PROGRAM_ID).key,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async submitGuardian({
    user,
    newGuardian,
  }: {
    user: UserFixture;
    newGuardian: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .submitGuardian({
        newGuardian: newGuardian.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async acceptGuardian({
    user,
  }: {
    user: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .acceptGuardian()
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async revokePendingGuardian({
    user,
  }: {
    user: UserFixture;
  }): Promise<void> {
    await this.program.methods
      .revokePendingGuardian()
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async setCurator({
    user,
    newCurator,
  }: {
    user: UserFixture;
    newCurator: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .setCurator({
        curator: newCurator.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async setAllocator({
    user,
    newAllocator,
    isAllocator,
  }: {
    user: UserFixture;
    newAllocator: UserFixture;
    isAllocator: boolean;
  }): Promise<void> {

    // set manager config account
    this.allocator = new AccountFixture(
      "allocatorState",
      deriveAllocatorAccount(this.managerVaultConfigAcc.key, newAllocator.key.publicKey, this.program.programId),
      this.program,
    );
 
    await this.program.methods
      .setAllocator({
        allocator: newAllocator.key.publicKey,
        isAllocator: isAllocator,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        allocator: this.allocator.key,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }


  async submitTimelock({
    user,
    newTimelock,
  }: {
    user: UserFixture;
    newTimelock: anchor.BN;
  }): Promise<void> {

    await this.program.methods
      .submitTimelock({
        newTimelock,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async acceptTimelock({
    user,
  }: {
    user: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .acceptTimelock()
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
      })
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  async revokePendingTimelock({
    user,
  }: {
    user: UserFixture;
  }): Promise<void> {

    await this.program.methods
      .revokePendingTimelock()
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
      })
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

  public get_market(marketId: PublicKey): MarketFixture {
    const market = this.markets.find(market => market.marketAcc.key.equals(marketId));
    if (!market) {
      throw new Error(`Market ${marketId.toBase58()} not found`);
    }
    return market;
  }

  public async get_allocator(user: PublicKey): Promise<AccountFixture | null> {
    let allocator = new AccountFixture(
      "allocatorState",
      deriveAllocatorAccount(this.managerVaultConfigAcc.key, user, this.program.programId),
      this.program,
    );

    console.log("allocator here:", await allocator.get_data());

    if (await allocator.get_data() == undefined) {
      return null;
    }

    return allocator;
  }
  
  // account related methods
  public get_ata(mint: PublicKey): PublicKey {
    return anchor.utils.token.associatedAddress({
      mint,
      owner: this.managerVaultConfigAcc.key,
    });
  }

}