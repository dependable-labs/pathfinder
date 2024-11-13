import { PublicKey } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";

export class AccountFixture {
  public name: string;
  public key: PublicKey;
  public program: Program<Markets>;

  public constructor(
    public _name: string,
    public _key: PublicKey,
    public _program: Program<Markets>,
  ) {
    this.name = _name;
    this.key = _key;
    this.program = _program;
  }

  public async get_data(): Promise<any> {
    return await this.program.account[this.name].fetch(this.key);
  }
}
