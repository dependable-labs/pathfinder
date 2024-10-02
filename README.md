# Pathfinder: Solana DeFi Market

## Description

Pathfinder is a decentralized finance (DeFi) application built on the Solana blockchain. It implements a market system where users can deposit quote tokens, receive shares representing their deposit, and potentially use these shares for further DeFi operations. This project demonstrates the implementation of a sophisticated market system using Solana's programming model and the Anchor framework.

## Features

- Initialize a new market
- Deposit quote tokens into the market
- Receive shares proportional to the deposit
- Handle collateral and quote tokens
- Implement advanced math operations for share calculations
- Protect against potential front-running attacks

## Prerequisites

Before you begin, ensure you have the following installed:

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://project-serum.github.io/anchor/getting-started/installation.html)
- [Node.js and npm](https://nodejs.org/en/download/)

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

5. Run tests:
   ```
   anchor test
   ```

This command will execute all the tests defined in the `tests` directory, verifying the functionality of your Pathfinder program.

## Project Structure

- `programs/pathfinder/src/`: Contains the Rust source code for the Solana program
  - `instructions/`: Defines the program's instructions (e.g., deposit)
  - `state/`: Defines the program's state accounts
  - `math/`: Contains mathematical operations for share calculations
- `tests/`: Contains TypeScript tests for the program
- `app/`: (If applicable) Contains the front-end application code

## Key Components

- Market: Represents the main state of the DeFi application
- Shares: Represents a user's stake in the market
- Quote and Collateral tokens: The tokens handled by the market

## Testing

Run the anchor tests using the `anchor test` command.
Run the rust sharesMath tests using the `cargo test` command.

## Disclaimer

**USE THIS CODE AT YOUR OWN RISK**

The code in this repository is provided "as is" without warranty of any kind, either express or implied. The author(s) and contributor(s) of this project take no responsibility for any consequences that may arise from the use of this code.

This project is for educational and experimental purposes only. It has not been audited or thoroughly tested for security vulnerabilities. Do not use this code in a production environment without proper review, testing, and auditing by professional smart contract auditors.

By using this code, you agree that the author(s) and contributor(s) of this project shall not be held liable for any damages, losses, or legal consequences arising from its use.