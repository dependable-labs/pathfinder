import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const INITIAL_TOKEN_AMOUNT = 100_000 * LAMPORTS_PER_SOL;

export class AccountFixture {
  public name: string;
  public key: PublicKey;
  public program: Program<Markets>;
  public provider: anchor.AnchorProvider;

  public constructor(
    public _name: string,
    public _key: PublicKey,
    public _program: Program<Markets>,
    public _provider: anchor.AnchorProvider,
  ) {
    this.name = _name;
    this.key = _key;
    this.program = _program;
    this.provider = _provider;
  }

  public async get_data(): Promise<any> {
    return await this.program.account[this.name].fetch(this.key);
  }
}
