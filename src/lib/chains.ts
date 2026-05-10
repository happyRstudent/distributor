import type { ChainConfig, ChainId } from './types';

export const CHAINS: Record<ChainId, ChainConfig> = {
  eth: {
    id: 'eth',
    name: 'Ethereum',
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    rpcUrl:
      process.env.NEXT_PUBLIC_ETH_RPC_URL || 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    chainId: 1,
  },
  bsc: {
    id: 'bsc',
    name: 'BNB Smart Chain',
    nativeCurrency: 'BNB',
    nativeDecimals: 18,
    rpcUrl:
      process.env.NEXT_PUBLIC_BSC_RPC_URL ||
      'https://bsc-dataseed1.binance.org',
    explorerUrl: 'https://bscscan.com',
    chainId: 56,
  },
  sol: {
    id: 'sol',
    name: 'Solana',
    nativeCurrency: 'SOL',
    nativeDecimals: 9,
    rpcUrl:
      process.env.NEXT_PUBLIC_SOL_RPC_URL ||
      'https://api.mainnet-beta.solana.com',
    explorerUrl: 'https://solscan.io',
    chainId: 101,
  },
};

export function isValidAddress(chain: ChainId, address: string): boolean {
  switch (chain) {
    case 'eth':
    case 'bsc':
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    case 'sol':
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
}

export function isValidPrivateKey(chain: ChainId, key: string): boolean {
  switch (chain) {
    case 'eth':
    case 'bsc':
      return /^(0x)?[a-fA-F0-9]{64}$/.test(key);
    case 'sol':
      // Accept base58 (most common) or JSON array
      if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(key)) return true;
      try {
        const parsed = JSON.parse(key);
        return Array.isArray(parsed) && parsed.length === 64;
      } catch {
        return false;
      }
  }
}
