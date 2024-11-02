import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Markets } from "../../target/types/markets";
import * as anchor from "@coral-xyz/anchor";
import { fund_w_sol } from "../utils";
import { ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { AccountFixture } from "./account";

export class ControllerFixture {
  public program: Program<Markets>;
  public provider: BankrunProvider;
  public authority: anchor.Wallet;
  public context: ProgramTestContext;
  public controllerAcc: AccountFixture;
  
  public constructor(
    public _program: Program<Markets>,
    public _provider: BankrunProvider,
    public _context: ProgramTestContext,
  ) {
    this.program = _program;
    this.provider = _provider;
    this.context = _context;
    this.authority = new anchor.Wallet(Keypair.generate());

    const [controllerKey] = PublicKey.findProgramAddressSync(
      [Buffer.from("controller")],
      this.program.programId
    );

    this.controllerAcc = new AccountFixture(
      "controller",
      controllerKey,
      this.program,
      this.provider
    );

    // Fund the controller with SOL
    fund_w_sol(this.context, this.authority.publicKey, 1);
  }

}