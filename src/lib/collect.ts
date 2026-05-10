import { ethers } from 'ethers';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import bs58 from 'bs58';

import type { ChainId } from './types';
import type { CollectOptions, CollectProgress } from './collect-types';
import { CHAINS } from './chains';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SWEEP_LEFTOVER_WEI: Record<string, bigint> = {
  eth: ethers.parseEther('0.0001'),
  bsc: ethers.parseEther('0.0001'),
};
const MAX_SWEEP_LEFTOVER_LAMPORTS = BigInt(200_000); // 0.0002 SOL

// ---------------------------------------------------------------------------
// Solana key parser (reuse from distribute.ts pattern)
// ---------------------------------------------------------------------------

function parseSolanaPrivateKey(key: string): Keypair {
  try {
    return Keypair.fromSecretKey(bs58.decode(key.trim()));
  } catch {
    // try JSON byte array
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

// ---------------------------------------------------------------------------
// EVM collect (ETH / BSC)
// ---------------------------------------------------------------------------

async function collectEVM(
  opts: CollectOptions,
  onUpdate: (i: number, p: Partial<CollectProgress>) => void,
): Promise<void> {
  const cfg = CHAINS[opts.chain];
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const symbol = cfg.nativeCurrency;
  const useSweepAll = !opts.amount || opts.amount.trim() === '';

  for (let i = 0; i < opts.privateKeys.length; i++) {
    const pkRaw = opts.privateKeys[i].trim();
    onUpdate(i, { status: 'pending', symbol });

    try {
      const pk = pkRaw.startsWith('0x') ? pkRaw : `0x${pkRaw}`;
      const wallet = new ethers.Wallet(pk, provider);
      const from = wallet.address;

      onUpdate(i, { from });

      // Query balance + nonce + fee data in parallel
      const [balance, nonce, feeData] = await Promise.all([
        provider.getBalance(from),
        provider.getTransactionCount(from, 'pending'),
        provider.getFeeData(),
      ]);

      // Estimate gas limit for a simple value transfer
      const gasLimit = await provider.estimateGas({
        from,
        to: opts.recipient,
        value: BigInt(0),
      });

      const maxPriorityFeePerGas = opts.maxPriorityFeeGwei
        ? ethers.parseUnits(opts.maxPriorityFeeGwei, 'gwei')
        : (feeData.maxPriorityFeePerGas ?? ethers.parseUnits('1.5', 'gwei'));
      const maxFeePerGas = opts.maxFeeGwei
        ? ethers.parseUnits(opts.maxFeeGwei, 'gwei')
        : (feeData.maxFeePerGas ??
          (feeData.gasPrice ?? ethers.parseUnits('3', 'gwei')));
      const gasPrice = feeData.gasPrice ?? maxFeePerGas;

      let valueWei: bigint;
      let txType: number;

      if (useSweepAll) {
        // Sweep-all: use legacy tx type (0) for deterministic fees
        txType = 0;
        const estimatedFeeWei = gasLimit * gasPrice;

        if (balance <= estimatedFeeWei) {
          onUpdate(i, {
            status: 'failed',
            error: `Balance too low to cover gas. Balance: ${ethers.formatEther(balance)} ${symbol}, Est. fee: ${ethers.formatEther(estimatedFeeWei)} ${symbol}`,
          });
          continue;
        }

        valueWei = balance - estimatedFeeWei;

        // Safety check: leftover after sweep should be minimal
        const leftoverWei = balance - valueWei - estimatedFeeWei;
        if (leftoverWei > MAX_SWEEP_LEFTOVER_WEI[opts.chain]) {
          onUpdate(i, {
            status: 'failed',
            error: `Leftover after sweep exceeds threshold (${ethers.formatEther(leftoverWei)} ${symbol} > ${ethers.formatEther(MAX_SWEEP_LEFTOVER_WEI[opts.chain])} ${symbol})`,
          });
          continue;
        }
      } else {
        txType = 2;
        valueWei = ethers.parseEther(opts.amount!);
        if (valueWei <= BigInt(0)) {
          onUpdate(i, {
            status: 'failed',
            error: 'Amount must be greater than 0',
          });
          continue;
        }

        // Check balance covers amount + fee
        const estimatedFeeWei = gasLimit * maxFeePerGas;
        if (balance < valueWei + estimatedFeeWei) {
          onUpdate(i, {
            status: 'failed',
            error: `Insufficient balance. Have ${ethers.formatEther(balance)} ${symbol}, need ${ethers.formatEther(valueWei + estimatedFeeWei)} ${symbol}`,
          });
          continue;
        }
      }

      // Build and sign transaction
      const txReq: ethers.TransactionRequest = {
        to: opts.recipient,
        value: valueWei,
        nonce,
        gasLimit,
        type: txType,
      };

      if (txType === 0) {
        // Legacy transaction
        txReq.gasPrice = gasPrice;
      } else {
        // EIP-1559 transaction
        txReq.maxPriorityFeePerGas = maxPriorityFeePerGas;
        txReq.maxFeePerGas = maxFeePerGas;
      }

      const signedTx = await wallet.signTransaction(txReq);
      const tx = await provider.broadcastTransaction(signedTx);

      onUpdate(i, {
        status: 'success',
        hash: tx.hash,
        amount: ethers.formatEther(valueWei),
        explorerUrl: `${cfg.explorerUrl}/tx/${tx.hash}`,
      });
    } catch (err: any) {
      onUpdate(i, {
        status: 'failed',
        error: err?.reason || err?.shortMessage || err?.message || 'Transaction failed',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Solana collect
// ---------------------------------------------------------------------------

async function collectSolana(
  opts: CollectOptions,
  onUpdate: (i: number, p: Partial<CollectProgress>) => void,
): Promise<void> {
  const cfg = CHAINS.sol;
  const connection = new Connection(cfg.rpcUrl, 'confirmed');
  const useSweepAll = !opts.amount || opts.amount.trim() === '';

  for (let i = 0; i < opts.privateKeys.length; i++) {
    const pkRaw = opts.privateKeys[i].trim();
    onUpdate(i, { status: 'pending', symbol: 'SOL' });

    try {
      const wallet = parseSolanaPrivateKey(pkRaw);
      const from = wallet.publicKey.toBase58();
      onUpdate(i, { from });

      const [latest, balanceLamports] = await Promise.all([
        connection.getLatestBlockhash('confirmed'),
        connection.getBalance(wallet.publicKey, 'confirmed'),
      ]);

      // Calculate fee by building a dummy message
      const toPk = new PublicKey(opts.recipient);
      const transferIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: toPk,
        lamports: 1,
      });
      const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latest.blockhash,
        instructions: [transferIx],
      }).compileToV0Message();
      const feeResp = await connection.getFeeForMessage(message, 'confirmed');
      const feeLamports = BigInt(feeResp.value ?? 5000);

      let lamports: bigint;

      if (useSweepAll) {
        if (BigInt(balanceLamports) <= feeLamports) {
          onUpdate(i, {
            status: 'failed',
            error: `Balance too low to cover fee. Balance: ${balanceLamports / LAMPORTS_PER_SOL} SOL, Fee: ${Number(feeLamports) / LAMPORTS_PER_SOL} SOL`,
          });
          continue;
        }

        lamports = BigInt(balanceLamports) - feeLamports;

        // Safety check
        const leftoverLamports = BigInt(balanceLamports) - lamports - feeLamports;
        if (leftoverLamports > MAX_SWEEP_LEFTOVER_LAMPORTS) {
          onUpdate(i, {
            status: 'failed',
            error: `Leftover after sweep exceeds threshold (${Number(leftoverLamports) / LAMPORTS_PER_SOL} SOL)`,
          });
          continue;
        }
      } else {
        lamports = BigInt(
          Math.floor(Number(opts.amount!) * LAMPORTS_PER_SOL),
        );
        if (lamports <= BigInt(0)) {
          onUpdate(i, {
            status: 'failed',
            error: 'Amount must be greater than 0',
          });
          continue;
        }

        if (BigInt(balanceLamports) < lamports + feeLamports) {
          onUpdate(i, {
            status: 'failed',
            error: `Insufficient balance. Have ${balanceLamports / LAMPORTS_PER_SOL} SOL`,
          });
          continue;
        }
      }

      // Build VersionedTransaction
      const ix = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: toPk,
        lamports: Number(lamports),
      });

      const txMessage = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latest.blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const vtx = new VersionedTransaction(txMessage);
      vtx.sign([wallet]);

      const sig = await connection.sendRawTransaction(vtx.serialize(), {
        skipPreflight: false,
      });

      onUpdate(i, {
        status: 'success',
        hash: sig,
        amount: String(Number(lamports) / LAMPORTS_PER_SOL),
        explorerUrl: `${cfg.explorerUrl}/tx/${sig}`,
      });
    } catch (err: any) {
      onUpdate(i, {
        status: 'failed',
        error: err?.message || 'Transaction failed',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function collectTokens(
  opts: CollectOptions,
  onUpdate: (i: number, p: Partial<CollectProgress>) => void,
): Promise<void> {
  if (opts.chain === 'sol') {
    return collectSolana(opts, onUpdate);
  }
  return collectEVM(opts, onUpdate);
}
