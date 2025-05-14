import { ComputeBudgetProgram, Keypair, PublicKey, sendAndConfirmTransaction, Transaction} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AssistantToTheRegionalManager } from "../../target/types/assistant_to_the_regional_manager";
import { BankrunProvider } from "anchor-bankrun";
import { UserFixture, AccountFixture, splAccountFixture, queueAccountFixture, MarketFixture} from "./index";
import {
  COMMITMENT,
  deriveManagerConfigAccount,
  deriveManagerMarketConfigAccount,
  deriveMultiManagerMarketConfigs,
  deriveQueueAccount,
  deriveAllocatorAccount,
  ONE_DAY_TIMELOCK,
  deriveTripleGroupRemainingAccounts,
  derivePairGroupRemainingAccounts,
  PATHFINDER_PROGRAM_ID,
  deriveSupplyShares,
} from "../utils";

export class ManagerFixture {
  public program: Program<AssistantToTheRegionalManager>;
  public provider: BankrunProvider;
  public quoteMint: PublicKey;
  public market: MarketFixture;
  public quoteAta: splAccountFixture;
  public managerVaultConfigAcc: AccountFixture;
  public allocator: AccountFixture;
  public queue: queueAccountFixture;
  public markets: MarketFixture[];
  public feeRecipient: UserFixture;

  public constructor(
    public _program: Program<AssistantToTheRegionalManager>,
    public _provider: BankrunProvider,
    public _quoteMint: PublicKey,
    public _markets: MarketFixture[],
  ) {
    this.program = _program;
    this.provider = _provider;
    this.quoteMint = _quoteMint;
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

    this.feeRecipient = feeRecipient;

    await this.program.methods
      .createManager({
        symbol,
        name,
        owner: owner.key.publicKey,
        guardian: guardian.key.publicKey,
        allocator: allocator.key.publicKey,
        feeRecipient: this.feeRecipient.key.publicKey,
        skimRecipient: skimRecipient.key.publicKey,
        curator: curator.key.publicKey,
        timelock: ONE_DAY_TIMELOCK,
        decimalsOffset: 0,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        quoteMint: this.quoteMint,
        queue: this.queue.key,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.key.payer])
      .rpc();
  }

  async setFeeRecipient({
    user,
    new_fee_recipient,
    markets,
  }: {
    user: UserFixture;
    new_fee_recipient: UserFixture;
    markets: MarketFixture[];
  }): Promise<void> {

    let remainingAcc = derivePairGroupRemainingAccounts(this.managerVaultConfigAcc.key, markets, this.program.programId);

    await this.program.methods
      .setFeeRecipient({
        newFeeRecipient: new_fee_recipient.key.publicKey
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        queue: this.queue.key,
        feeRecipientShares: deriveSupplyShares(this.feeRecipient.key.publicKey, this.managerVaultConfigAcc.key, this.program.programId),
        newFeeRecipientShares: deriveSupplyShares(new_fee_recipient.key.publicKey, this.managerVaultConfigAcc.key, this.program.programId),
        pathfinderConfig: markets[0].get_config().key,
        pathfinderProgram: PATHFINDER_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      // NOTE: remaining accounts are [market, lender_shares ...]
      .remainingAccounts(remainingAcc)
      .signers([user.key.payer])
      .rpc(COMMITMENT); 
  }

  async setFee({
    user,
    fee,
    markets,
  }: {
    user: UserFixture;
    fee: anchor.BN;
    markets: MarketFixture[];
  }): Promise<void> {

    let remainingAcc = derivePairGroupRemainingAccounts(this.managerVaultConfigAcc.key, markets, this.program.programId);

    await this.program.methods
      .setFee({
        fee,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        queue: this.queue.key,
        feeRecipientShares: deriveSupplyShares(this.feeRecipient.key.publicKey, this.managerVaultConfigAcc.key, this.program.programId),
        pathfinderConfig: markets[0].get_config().key,
        pathfinderProgram: PATHFINDER_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      // NOTE: remaining accounts are [market, lender_shares ...]
      .remainingAccounts(remainingAcc)
      .signers([user.key.payer])
      .rpc(COMMITMENT); 
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
      .remainingAccounts(deriveMultiManagerMarketConfigs(this.managerVaultConfigAcc.key, marketIds, this.program.programId))
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


  async depositCustomCU({
    user,
    receiver,
    assets,
    markets,
    customCU,
  }: {
    user: UserFixture;
    receiver: UserFixture;
    assets: anchor.BN;
    markets: MarketFixture[];
    customCU: number;
  }): Promise<void> {

    let remainingAcc = deriveTripleGroupRemainingAccounts(this.managerVaultConfigAcc.key, markets, this.program.programId);
    const budgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({
      units: customCU,
    });

    let tx = await this.program.methods
      .deposit({
        assets,
        receiver: receiver.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        queue: this.queue.key,
        feeRecipientShares: deriveSupplyShares(this.feeRecipient.key.publicKey, this.managerVaultConfigAcc.key, this.program.programId),
        receiverShares: deriveSupplyShares(receiver.key.publicKey, this.managerVaultConfigAcc.key, this.program.programId),
        pathfinderConfig: markets[0].get_config().key,
        vaultAtaQuote: markets[0].quoteAta.key,
        userAtaQuote: user.quoteAta,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        pathfinderProgram: PATHFINDER_PROGRAM_ID,
        // NOTE: remaining accounts are [market, lender_shares, manager_market_config, ...]
      })
      .remainingAccounts(remainingAcc)
      .transaction();
    
    
    tx = tx.add(
      budgetInstruction,
    )
    tx.recentBlockhash = (await this.provider.context.banksClient.getLatestBlockhash())[0]
    tx.sign(user.key.payer);
    tx.feePayer = user.key.publicKey;

    // try {
    //   let simTx = await this.provider.context.banksClient.simulateTransaction(tx, 'confirmed');
    //   console.log("simTx logs:", simTx.meta.logMessages);
    // } catch (error) {
    //   console.error("Simulation error details:", {
    //     error: error.message,
    //     code: error.code,
    //     logs: error.logs,
    //     stack: error.stack
    //   });
    // }

    await this.provider.context.banksClient.processTransaction(tx);
  }

  async deposit({
      user,
      receiver,
      assets,
      markets,
  }: {
    user: UserFixture;
    receiver: UserFixture;
    assets: anchor.BN;
    markets: MarketFixture[];
  }): Promise < void> {

    let remainingAcc = deriveTripleGroupRemainingAccounts(this.managerVaultConfigAcc.key, markets, this.program.programId);
    console.log("remainingAcc", remainingAcc);

    await this.program.methods
      .deposit({
        assets,
        receiver: receiver.key.publicKey,
      })
      .accounts({
        user: user.key.publicKey,
        config: this.managerVaultConfigAcc.key,
        queue: this.queue.key,
        feeRecipientShares: deriveSupplyShares(this.feeRecipient.key.publicKey, this.managerVaultConfigAcc.key, this.program.programId),
        receiverShares: deriveSupplyShares(receiver.key.publicKey, this.managerVaultConfigAcc.key, this.program.programId),
        pathfinderConfig: markets[0].get_config().key,
        vaultAtaQuote: markets[0].quoteAta.key,
        userAtaQuote: user.quoteAta,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        pathfinderProgram: PATHFINDER_PROGRAM_ID,
        // NOTE: remaining accounts are [market, lender_shares, manager_market_config, ...]
      })
      .remainingAccounts(remainingAcc)
      .signers([user.key.payer])
      .rpc(COMMITMENT);
  }

  public get_market_config(marketId: PublicKey): AccountFixture {
    return new AccountFixture(
      "managerMarketConfig",
      deriveManagerMarketConfigAccount(
        this.managerVaultConfigAcc.key,
        marketId,
        this.program.programId
      ),
      this.program
    );
  }

  public get_supply_shares(user: PublicKey): AccountFixture {
    return new AccountFixture(
      "supplyShares",
      deriveSupplyShares(user, this.managerVaultConfigAcc.key, this.program.programId),
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