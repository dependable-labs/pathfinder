import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createHash } from "crypto";
import {
  PublicKey,
  Finality,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createMint } from "spl-token-bankrun";

import { Pathfinder } from "../target/types/pathfinder";
import { AssistantToTheRegionalManager } from "../target/types/assistant_to_the_regional_manager";
import { startAnchor, BankrunProvider } from 'anchor-bankrun';
import { ProgramTestContext, Clock, BanksClient} from "solana-bankrun";
import { UserFixture, MarketFixture, CollateralFixture, SupportedCollateral, OracleSource, ManagerFixture } from "./fixtures";
const PATHFINDER_IDL = require("../target/idl/pathfinder.json");
const MANAGER_IDL = require("../target/idl/assistant_to_the_regional_manager.json");

export const MPL_TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
export const COMMITMENT: { commitment: Finality } = { commitment: "confirmed" };

export function create_account_w_sol(
  context: ProgramTestContext,
  pubkey: PublicKey,
  sol_amount: number,
  data: Buffer = Buffer.alloc(0),
) {
  create_custom_account(
    context,
    pubkey,
    anchor.web3.SystemProgram.programId,
    LAMPORTS_PER_SOL * sol_amount,
    data
  );
}

export function create_custom_account(
  context: ProgramTestContext,
  pubkey: PublicKey,
  owner: PublicKey,
  lamports: number,
  data: Buffer,
  rentEpoch: number,
) {
  context.setAccount(pubkey, {
    executable: false,
    owner: owner,
    lamports: lamports,
    data: data,
    rentEpoch: rentEpoch,
  });
}

function getFeedIdFromHex(input: string): Buffer {
  // Remove '0x' prefix if present
  const hexString = input.startsWith('0x') ? input.slice(2) : input;
  
  // Validate length
  if (hexString.length !== 64) {
    throw new Error('Feed ID must be 32 bytes');
  }

  // Convert hex to bytes
  return Buffer.from(hexString, 'hex');
}

export function deriveMarketAddress(
  quoteMint: PublicKey,
  collateralMint: PublicKey,
  ltvFactor: anchor.BN,
  oracleId: PublicKey,
  programId: PublicKey
) {

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      quoteMint.toBuffer(),
      collateralMint.toBuffer(),
      Buffer.from(ltvFactor.toArray("le", 8)),
      oracleId.toBuffer(),
    ],
    programId
  )[0];
}

export function deriveManagerConfigAccount(
  quoteMint: PublicKey,
  symbol: string,
  name: string,
  programId: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("managerconfig"),
      quoteMint.toBuffer(),
      Buffer.from(symbol),
      Buffer.from(name),
    ],
    programId
  )[0];
}

export function deriveMetadataAccount(
  shareMint: PublicKey,
  tokenMetadataProgramId: PublicKey,
  programId: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      tokenMetadataProgramId.toBuffer(),
      shareMint.toBuffer(),
    ],
    tokenMetadataProgramId
  )[0];
}

export function deriveMultiMarketConfigs(
  managerConfig: PublicKey,
  marketIds: PublicKey[],
  programId: PublicKey
) {
  return marketIds.map((marketId) => {
    return {
      pubkey: deriveMarketConfigAccount(
        managerConfig,
        marketId,
        programId
      ),
      isSigner: false,
      isWritable: false
    }
  });
}

export function deriveMarketConfigAccount(
  managerConfig: PublicKey,
  marketId: PublicKey,
  programId: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("managermarketconfig"),
      managerConfig.toBuffer(),
      marketId.toBuffer(),
    ],
    programId
  )[0];
}

export function deriveQueueAccount(
  managerConfig: PublicKey,
  programId: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("managerqueue"),
      managerConfig.toBuffer(),
    ],
    programId
  )[0];
}


export class TestUtils {
  private program: Program<Pathfinder>;
  private managerProgram: Program<AssistantToTheRegionalManager>;
  private provider: BankrunProvider;
  private banks: BanksClient;
  private context: ProgramTestContext;
  private quoteMint: PublicKey;
  private collateralMint: PublicKey;

  public static async create({
    quoteDecimals = 9,
    collateralDecimals = 9,
  }: {
    quoteDecimals?: number,
    collateralDecimals?: number,
  }): Promise<TestUtils> {
    const instance = new TestUtils();
    
    instance.context = await startAnchor(
      '',
      [{ name: "metadata", programId: MPL_TOKEN_METADATA_PROGRAM_ID }],
      []
    );
    instance.provider = new BankrunProvider(instance.context);
    instance.program = new Program<Pathfinder>(PATHFINDER_IDL, instance.provider);
    instance.managerProgram = new Program<AssistantToTheRegionalManager>(MANAGER_IDL, instance.provider);
    instance.banks = instance.context.banksClient;

    const owner = instance.provider.wallet.publicKey;
    const payer = instance.provider.wallet.payer;

    instance.quoteMint = await createMint(
      instance.banks,
      payer,
      owner,
      owner,
      quoteDecimals
    );

    instance.collateralMint = await createMint(
      instance.banks,
      payer,
      owner,
      owner,
      collateralDecimals
    );

    return instance;
  }

  public async createUser(quoteAmount: anchor.BN, collateralAmount: anchor.BN) {
    let user = new UserFixture(
      this.provider,
      this.quoteMint,
      this.collateralMint
    );

    await user.init_and_fund_accounts(
      quoteAmount,
      collateralAmount
    );

    return user;
  }

  public async createMarket(
    {
      symbol,
      ltvFactor,
      price,
      conf,
      expo,
      feeRecipient,
      authority,
      oracleSource = OracleSource.PythPull,
    }: {
      symbol: string,
      ltvFactor: anchor.BN,
      price: anchor.BN,
      conf: anchor.BN,
      expo: number,
      feeRecipient: UserFixture,
      authority: UserFixture,
      oracleSource?: OracleSource,
    }
  ) {
    const collateral = new CollateralFixture(
      symbol as SupportedCollateral,
      this.program,
      this.provider,
      this.collateralMint,
      ltvFactor,
      oracleSource
    );

    await collateral.initPrice({
      price,
      conf,
      expo
    });

    return new MarketFixture(
      this.program,
      this.provider,
      this.quoteMint,
      this.collateralMint,
      symbol as SupportedCollateral,
      collateral,
      feeRecipient,
      authority
    );
  }

  public async initManagerFixture() {
    return new ManagerFixture(
      this.managerProgram,
      this.provider,
      this.quoteMint,
    );
  }

  // time utils
  public async moveTimeForward(seconds: number): Promise<void> {
    const currentClock = await this.context.banksClient.getClock();
    const newUnixTimestamp = currentClock.unixTimestamp + BigInt(seconds);
    const newClock = new Clock(
      currentClock.slot,
      currentClock.epochStartTimestamp,
      currentClock.epoch,
      currentClock.leaderScheduleEpoch,
      newUnixTimestamp
    );
    this.context.setClock(newClock);
  }

  public async getTime(): Promise<number> {
    const currentClock = await this.context.banksClient.getClock();
    return Number(currentClock.unixTimestamp);
  }
}
