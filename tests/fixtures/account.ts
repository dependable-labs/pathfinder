import { PublicKey } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Markets } from "../../target/types/markets";
import { getAccount } from '@solana/spl-token';


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
    try {
      return await this.program.account[this.name].fetch(this.key);
    } catch (e) {
      return undefined;
    }
  }
}

export class splAccountFixture extends AccountFixture {
  public async getTokenBalance(): Promise<bigint> {
    const account = await getAccount(this.program.provider.connection, this.key);
    return account.amount;
  }

}

export class marketAccountFixture extends AccountFixture {
  public async getTotalDeposits(): Promise<anchor.BN> {
    const market = await this.get_data();
    return market.depositIndex
                    .mul(market.totalShares)
                    .div(new anchor.BN("1000000000000000000"));
  }

  public async getTotalBorrows(): Promise<anchor.BN> {
    const market = await this.get_data();
    return market.borrowIndex
                    .mul(market.totalBorrowShares)
                    .div(new anchor.BN("1000000000000000000"));
  }
}

