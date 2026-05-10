export type ChainId = 'eth' | 'bsc' | 'sol';

export interface ChainConfig {
  id: ChainId;
  name: string;
  nativeCurrency: string;
  nativeDecimals: number;
  rpcUrl: string;
  explorerUrl: string;
  chainId: number;
}

export interface TxProgress {
  index: number;
  recipient: string;
  amount: string;
  symbol: string;
  hash?: string;
  status: 'idle' | 'pending' | 'success' | 'failed';
  error?: string;
  explorerUrl?: string;
}
