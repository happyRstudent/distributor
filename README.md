# Token Distributor

A multi-chain token distribution platform built with Next.js. Send native coins or token contracts to multiple wallets in a single batch across **Ethereum**, **BNB Smart Chain**, and **Solana**.

## Features

- **Multi-chain support** — ETH, BSC, and Solana
- **Batch distribution** — send to multiple recipients in one click
- **Native coins & tokens** — send ETH/BNB/SOL or ERC-20/SPL tokens
- **Real-time progress** — live transaction status with explorer links
- **In-browser signing** — private keys are processed client-side and never sent to any server
- **Pre-flight checks** — balance validation and gas fee safety checks before any transfer

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/happyRstudent/distributor.git
cd distributor
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

### Environment Variables (Optional)

Copy `.env.example` to `.env.local` to override default RPC URLs:

```env
NEXT_PUBLIC_ETH_RPC_URL=https://eth.llamarpc.com
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed1.binance.org
NEXT_PUBLIC_SOL_RPC_URL=https://api.mainnet-beta.solana.com
```

If not set, the app uses public RPC endpoints by default.

## Usage

1. Select the target network (ETH / BSC / SOL)
2. Enter the source wallet's private key (processed locally, never transmitted)
3. Paste recipient wallet addresses (one per line or comma-separated)
4. Choose **Native Coin** or **Token Contract**
5. If using a token, enter the token contract address
6. Enter the amount per wallet
7. Click **Start Distribution**

The app will execute transfers sequentially and show real-time progress with block explorer links for each transaction.

## Deploy on Vercel

The easiest way to deploy is via [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/happyRstudent/distributor)

Or using the Vercel CLI:

```bash
npm i -g vercel
vercel
```

> **Note:** Environment variables (`NEXT_PUBLIC_*_RPC_URL`) can be configured in the Vercel dashboard under **Settings → Environment Variables**.

## Tech Stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [React 18](https://react.dev/)
- [ethers.js v6](https://docs.ethers.org/) — EVM chain interaction
- [@solana/web3.js](https://solana-labs.github.io/solana-web3.js/) — Solana interaction
- [@solana/spl-token](https://github.com/solana-labs/solana-program-library) — SPL token transfers
- [Tailwind CSS](https://tailwindcss.com/)
- [TypeScript](https://www.typescriptlang.org/)

## Supported Chains

| Chain              | Native Coin | Token Standard | Explorer         |
| ------------------ | ----------- | -------------- | ---------------- |
| Ethereum           | ETH         | ERC-20         | etherscan.io     |
| BNB Smart Chain    | BNB         | BEP-20         | bscscan.com      |
| Solana             | SOL         | SPL            | solscan.io       |

## Security

- Private keys are processed entirely in your browser and **never** sent to any server
- Source code is open and verifiable
- Always review transactions before signing (when using hardware wallets)
- Test with small amounts first

## License

MIT
