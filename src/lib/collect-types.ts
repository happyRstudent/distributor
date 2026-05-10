import type { ChainId } from './types';

export interface CollectProgress {
  index: number;
  from: string;
  amount: string;
  symbol: string;
  hash?: string;
  status: 'idle' | 'pending' | 'success' | 'failed';
  error?: string;
  explorerUrl?: string;
}

export interface CollectOptions {
  chain: ChainId;
  privateKeys: string[];
  recipient: string;
  amount?: string; // undefined = sweep all
  maxFeeGwei?: string;
  maxPriorityFeeGwei?: string;
}
