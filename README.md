# Pathfinder: Solana DeFi Market

## Description

Pathfinder is a decentralized finance (DeFi) application built on the Solana blockchain. It implements a market system where users can withdraw quote tokens, burn shares representing their withdrawal, and potentially use these shares for further DeFi operations. This project demonstrates the implementation of a sophisticated market system using Solana's programming model and the Anchor framework.

## Features

- Initialize a new market
- Withdraw quote tokens from the market
- Burn shares proportional to the withdrawal
- Handle collateral and quote tokens
- Implement advanced math operations for share calculations
- Protect against potential front-running attacks

## Prerequisites

Before you begin, ensure you have the following installed:

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://project-serum.github.io/anchor/getting-started/installation.html)
- [Node.js and npm](https://nodejs.org/en/download/)

## Prerequisite local env cli versions
- Rust: 1.79.0
- Solana CLI: 2.0.26
- Anchor: 0.30.1



## Installation and Setup

1. Clone the repository:
   ```
   git clone https://github.com/ith-harvey/pathfinder.git
   cd pathfinder
   ```

2. Install dependencies:
   ```
   yarn install
   ```

3. Build the project:
   ```
   anchor build
   ```

4. Update the program ID in `lib.rs` and `Anchor.toml` with the new program ID generated during the build process.

5. Update the `wallet` variable in `Anchor.toml` with your local wallet.

6. Run tests:
   ```
   anchor test
   ```

This command will execute all the tests defined in the `tests` directory, verifying the functionality of your Pathfinder program.

## Project Structure

- `programs/pathfinder/src/`: Contains the Rust source code for the Solana program
  - `instructions/`: Defines the program's instructions (e.g., withdraw)
  - `state/`: Defines the program's state accounts
  - `math/`: Contains mathematical operations for share calculations
- `tests/`: Contains TypeScript tests for the program
- `app/`: (If applicable) Contains the front-end application code

## Key Components

- Market: The core lending pool that manages quote tokens and collateral positions
  - Handles deposits/withdrawals of quote tokens
  - Tracks total shares and total quote token amounts
  - Manages borrow positions and interest accrual
  - Controls debt caps and utilization rates

- Collateral: Represents accepted collateral tokens in the market
  - Tracks total collateral amounts
  - Manages loan-to-value (LTV) ratios
  - Integrates with Pyth oracles for price feeds
  - Controls liquidation parameters

- Shares: 
  - LenderShares: Represents lender's share of the quote token pool
  - BorrowerShares: Tracks borrower's debt and collateral positions

- Controller:
  - Manages market authority and permissions
  - Controls market creation and updates
  - Enforces protocol-wide parameters

- Interest Rate Model:
  - Dynamic rate adjustment based on utilization
  - Compounded interest accrual
  - Target utilization mechanisms

## Testing

Anchor and basic cargo tests:
Run the anchor tests using the `anchor test` command.
Run the rust sharesMath tests using the `cargo test` command.

Fuzzing:
Run the fuzz tests using the `cargo +nightly-2024-06-05 fuzz run math -Zbuild-std --strip-dead-code --no-cfg-fuzzing -- -max_total_time=300` command.

## Devnet deployment

pathfinder program ID: `A19kT1hDurp5ntmD19yA1mYxJPDn3UVZL7Ue6Wo9HaVj`

## Common Issues and Solutions

### Version Mismatch Errors
If you encounter errors like:
```
error: package `solana-program v1.17.14` cannot be built because it requires rustc 1.68.0 or newer
```

This usually indicates a version mismatch between package dependencies. To resolve:

1. Ensure all packages are using compatible versions:
```bash
# cargo update -p solana-program --precise 1.18.11
cargo update -p solana-program@2.1.13 --precise 1.18.11
cargo update -p anchor-lang --precise 0.30.1
```


## Disclaimer

**USE THIS CODE AT YOUR OWN RISK**

The code in this repository is provided "as is" without warranty of any kind, either express or implied. The author(s) and contributor(s) of this project take no responsibility for any consequences that may arise from the use of this code.

This project is for educational and experimental purposes only. It has not been audited or thoroughly tested for security vulnerabilities. Do not use this code in a production environment without proper review, testing, and auditing by professional smart contract auditors.

By using this code, you agree that the author(s) and contributor(s) of this project shall not be held liable for any damages, losses, or legal consequences arising from its use.