import { ethers } from 'ethers';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  transfer as splTransfer,
  getMint,
} from '@solana/spl-token';
import bs58 from 'bs58';

import type { ChainId, TxProgress } from './types';
import { CHAINS } from './chains';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function name() view returns (string)',
];

// ---------------------------------------------------------------------------
// EVM (Ethereum / BSC)
// ---------------------------------------------------------------------------

async function distributeEVM(
  chain: ChainId,
  privateKey: string,
  recipients: string[],
  isNative: boolean,
  tokenAddress: string | undefined,
  amount: string,
  onUpdate: (i: number, p: Partial<TxProgress>) => void,
): Promise<void> {
  const cfg = CHAINS[chain];
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(pk, provider);

  let decimals: number;
  let symbol: string;
  let contract: ethers.Contract | null = null;

  if (isNative) {
    decimals = cfg.nativeDecimals;
    symbol = cfg.nativeCurrency;
  } else {
    contract = new ethers.Contract(tokenAddress!, ERC20_ABI, wallet);
    [decimals, symbol] = await Promise.all([
      contract.decimals(),
      contract.symbol(),
    ]);
  }

  const parsedAmount = ethers.parseUnits(amount, decimals);

  // Pre-flight balance check
  if (isNative) {
    const balance = await provider.getBalance(wallet.address);
    const totalNeeded = parsedAmount * BigInt(recipients.length);
    if (balance < totalNeeded) {
      const have = ethers.formatEther(balance);
      const need = ethers.formatEther(totalNeeded);
      throw new Error(
        `Insufficient ${symbol} balance. You have ${have} ${symbol}, need ${need} ${symbol} (for ${recipients.length} recipients).`,
      );
    }
    // Also leave some for gas
    if (balance - totalNeeded < ethers.parseEther('0.001')) {
      throw new Error(
        `Insufficient ${symbol} for gas fees. Please keep at least 0.001 ${symbol} for gas.`,
      );
    }
  } else {
    const balance = await contract!.balanceOf(wallet.address);
    const totalNeeded = parsedAmount * BigInt(recipients.length);
    if (balance < totalNeeded) {
      throw new Error(
        `Insufficient ${symbol} balance in source wallet.`,
      );
    }
  }

  // Execute transfers
  for (let i = 0; i < recipients.length; i++) {
    onUpdate(i, { status: 'pending', symbol });

    try {
      let tx;
      if (isNative) {
        tx = await wallet.sendTransaction({
          to: recipients[i],
          value: parsedAmount,
        });
      } else {
        tx = await contract!.transfer(recipients[i], parsedAmount);
      }

      await tx.wait();
      onUpdate(i, {
        status: 'success',
        hash: tx.hash,
        explorerUrl: `${cfg.explorerUrl}/tx/${tx.hash}`,
        symbol,
      });
    } catch (err: any) {
      onUpdate(i, {
        status: 'failed',
        error: err?.reason || err?.message || 'Transaction failed',
        symbol,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Solana
// ---------------------------------------------------------------------------

function parseSolanaPrivateKey(key: string): Keypair {
  // base58
  try {
    return Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    // JSON byte array
  }
  try {
    const arr = JSON.parse(key) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch {
    //
  }
  throw new Error(
    'Invalid Solana private key. Use base58 or Phantom JSON array format.',
  );
}

// Parse a decimal amount string into the smallest unit as a number.
// Accepts strings like "1", "0.1", "1.5".
function parseLamports(amount: string, decimals: number): number {
  const [whole = '0', fraction = ''] = amount.split('.');
  const padded = fraction.padEnd(decimals, '0').slice(0, decimals);
  return Number(whole + padded);
}

async function distributeSolana(
  privateKey: string,
  recipients: string[],
  isNative: boolean,
  tokenAddress: string | undefined,
  amount: string,
  onUpdate: (i: number, p: Partial<TxProgress>) => void,
): Promise<void> {
  const cfg = CHAINS.sol;
  const connection = new Connection(cfg.rpcUrl, 'confirmed');
  const wallet = parseSolanaPrivateKey(privateKey);

  if (isNative) {
    const lamports = parseLamports(amount, 9);
    const balance = await connection.getBalance(wallet.publicKey);
    const totalNeeded = lamports * recipients.length;

    if (balance < totalNeeded) {
      throw new Error(
        `Insufficient SOL balance. You have ${balance / LAMPORTS_PER_SOL} SOL, ` +
          `need ${totalNeeded / LAMPORTS_PER_SOL} SOL (for ${recipients.length} recipients).`,
      );
    }
    // Reserve ~0.001 SOL for fees
    if (balance - totalNeeded < LAMPORTS_PER_SOL * 0.001) {
      throw new Error(
        `Insufficient SOL for gas fees. Keep at least 0.001 SOL.`,
      );
    }

    for (let i = 0; i < recipients.length; i++) {
      onUpdate(i, { status: 'pending', symbol: 'SOL' });
      try {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: new PublicKey(recipients[i]),
            lamports,
          }),
        );
        const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
        onUpdate(i, {
          status: 'success',
          hash: sig,
          explorerUrl: `${cfg.explorerUrl}/tx/${sig}`,
          symbol: 'SOL',
        });
      } catch (err: any) {
        onUpdate(i, {
          status: 'failed',
          error: err?.message || 'Transaction failed',
          symbol: 'SOL',
        });
      }
    }
  } else {
    // SPL token transfer
    const mintPubkey = new PublicKey(tokenAddress!);
    const mintInfo = await getMint(connection, mintPubkey);
    const tokenDecimals = mintInfo.decimals;
    const tokenAmount = parseLamports(amount, tokenDecimals);
    const senderATA = getAssociatedTokenAddressSync(
      mintPubkey,
      wallet.publicKey,
    );

    // SPL tokens carry no symbol on-chain; show truncated mint address
    const symbol = `${tokenAddress!.slice(0, 6)}...`;

    // Pre-check sender's token balance
    const senderBalance = await connection.getTokenAccountBalance(senderATA);
    const totalNeeded = tokenAmount * recipients.length;
    if (Number(senderBalance.value.amount) < totalNeeded) {
      throw new Error(
        `Insufficient token balance in source wallet.`,
      );
    }

    for (let i = 0; i < recipients.length; i++) {
      onUpdate(i, { status: 'pending', symbol });
      try {
        const recipientPubkey = new PublicKey(recipients[i]);

        // Ensure recipient has an associated token account
        const destATA = await getOrCreateAssociatedTokenAccount(
          connection,
          wallet,
          mintPubkey,
          recipientPubkey,
        );

        const sig = await splTransfer(
          connection,
          wallet,
          senderATA,
          destATA.address,
          wallet.publicKey,
          BigInt(tokenAmount),
        );

        onUpdate(i, {
          status: 'success',
          hash: sig,
          explorerUrl: `${cfg.explorerUrl}/tx/${sig}`,
          symbol,
        });
      } catch (err: any) {
        onUpdate(i, {
          status: 'failed',
          error: err?.message || 'Transaction failed',
          symbol,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DistributeOptions {
  chain: ChainId;
  privateKey: string;
  recipients: string[];
  isNative: boolean;
  tokenAddress?: string;
  amount: string;
}

export async function distributeTokens(
  opts: DistributeOptions,
  onUpdate: (i: number, p: Partial<TxProgress>) => void,
): Promise<void> {
  if (opts.chain === 'sol') {
    return distributeSolana(
      opts.privateKey,
      opts.recipients,
      opts.isNative,
      opts.tokenAddress,
      opts.amount,
      onUpdate,
    );
  }
  return distributeEVM(
    opts.chain,
    opts.privateKey,
    opts.recipients,
    opts.isNative,
    opts.tokenAddress,
    opts.amount,
    onUpdate,
  );
}
