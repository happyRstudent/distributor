'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { ChainId } from '@/lib/types';
import type { CollectProgress } from '@/lib/collect-types';
import { CHAINS, isValidAddress, isValidPrivateKey } from '@/lib/chains';
import { collectTokens } from '@/lib/collect';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_LIST: ChainId[] = ['eth', 'bsc', 'sol'];

function chainLabel(id: ChainId) {
  const c = CHAINS[id];
  return `${c.name} (${c.nativeCurrency})`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePrivateKeys(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildInitialProgress(n: number): CollectProgress[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    from: '',
    amount: '',
    symbol: '',
    status: 'idle' as const,
  }));
}

function truncateAddress(addr: string): string {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CollectPage() {
  // Form state
  const [chain, setChain] = useState<ChainId>('eth');
  const [recipient, setRecipient] = useState('');
  const [privateKeysRaw, setPrivateKeysRaw] = useState('');
  const [amount, setAmount] = useState('');
  const [maxFeeGwei, setMaxFeeGwei] = useState('');
  const [maxPriorityFeeGwei, setMaxPriorityFeeGwei] = useState('');

  // Tx state
  const [progress, setProgress] = useState<CollectProgress[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<{
    collected: number;
    failed: number;
    totalAmount: string;
  } | null>(null);

  const abortRef = useRef(false);
  const inputKey = useRef(0);

  // Derived
  const privateKeys = parsePrivateKeys(privateKeysRaw);
  const nativeLabel = CHAINS[chain].nativeCurrency;
  const isEVM = chain !== 'sol';
  const isSweepAll = !amount || amount.trim() === '';

  // Validate
  const validRecipient = isValidAddress(chain, recipient);
  const validKeys = privateKeys.length > 0 && privateKeys.every((k) => isValidPrivateKey(chain, k));
  const validAmount = isSweepAll || Number(amount) > 0;

  const canSubmit =
    !running &&
    validRecipient &&
    validKeys &&
    validAmount;

  // -----------------------------------------------------------------------
  // Chain switch helper
  // -----------------------------------------------------------------------
  const handleChainChange = useCallback((id: ChainId) => {
    setChain(id);
    setRecipient('');
    setAmount('');
    setMaxFeeGwei('');
    setMaxPriorityFeeGwei('');
    setError('');
    setSummary(null);
    setProgress([]);
  }, []);

  // -----------------------------------------------------------------------
  // Collect runner
  // -----------------------------------------------------------------------
  const handleCollect = useCallback(async () => {
    setError('');
    setSummary(null);
    abortRef.current = false;

    const keys = parsePrivateKeys(privateKeysRaw);
    const init = buildInitialProgress(keys.length);
    setProgress(init);
    setRunning(true);

    const onUpdate = (i: number, p: Partial<CollectProgress>) => {
      setProgress((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], ...p };
        return next;
      });
    };

    try {
      await collectTokens(
        {
          chain,
          privateKeys: keys,
          recipient,
          amount: isSweepAll ? undefined : amount,
          maxFeeGwei: maxFeeGwei || undefined,
          maxPriorityFeeGwei: maxPriorityFeeGwei || undefined,
        },
        onUpdate,
      );

      // Build summary
      setProgress((prev) => {
        const collected = prev.filter((t) => t.status === 'success').length;
        const failed = prev.filter((t) => t.status === 'failed').length;
        const totalAmount = prev
          .filter((t) => t.status === 'success')
          .reduce((sum, t) => sum + Number(t.amount || 0), 0);
        setSummary({
          collected,
          failed,
          totalAmount: totalAmount.toFixed(6),
        });
        return prev;
      });
    } catch (err: any) {
      setError(err?.message || 'Collection failed');
    } finally {
      setRunning(false);
    }
  }, [chain, privateKeysRaw, recipient, amount, isSweepAll, maxFeeGwei, maxPriorityFeeGwei]);

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------
  const handleReset = useCallback(() => {
    setRecipient('');
    setPrivateKeysRaw('');
    setAmount('');
    setMaxFeeGwei('');
    setMaxPriorityFeeGwei('');
    setProgress([]);
    setRunning(false);
    setError('');
    setSummary(null);
    abortRef.current = false;
    inputKey.current++;
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Token Collector
          </h1>
          <p className="mt-2 text-gray-400">
            Sweep native coins from multiple wallets into one destination
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-6">
          <Link
            href="/"
            className="flex-1 py-3 rounded-xl font-medium text-sm text-center transition-all duration-200 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200"
          >
            Distribute
          </Link>
          <Link
            href="/collect"
            className="flex-1 py-3 rounded-xl font-medium text-sm text-center transition-all duration-200 bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
          >
            Collect
          </Link>
        </div>

        {/* Main Card */}
        <div className="glass p-6 md:p-8 space-y-8">
          {/* ── Chain selector ── */}
          <section>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Network
            </label>
            <div className="flex gap-2">
              {CHAIN_LIST.map((id) => {
                const active = chain === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={running}
                    onClick={() => handleChainChange(id)}
                    className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                      active
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                    } disabled:opacity-50`}
                  >
                    {id.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Destination address ── */}
          <section>
            <label
              htmlFor="recipient"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Destination Address
            </label>
            <input
              id="recipient"
              type="text"
              placeholder={
                chain === 'sol'
                  ? 'So1anaAddress...'
                  : '0x...'
              }
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              className="input-field font-mono text-sm"
              disabled={running}
              autoComplete="off"
              key={`recip-${inputKey.current}`}
            />
            {recipient &&
              !validRecipient &&
              recipient.length > 5 && (
                <p className="mt-1 text-xs text-red-400">
                  Invalid address format for {CHAINS[chain].name}
                </p>
              )}
          </section>

          {/* ── Source private keys ── */}
          <section>
            <label
              htmlFor="privateKeys"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Source Wallet Private Keys
            </label>
            <textarea
              id="privateKeys"
              rows={5}
              placeholder={
                chain === 'sol'
                  ? 'Base58 key or JSON array, one per line...'
                  : '0x..., one per line...'
              }
              value={privateKeysRaw}
              onChange={(e) => setPrivateKeysRaw(e.target.value)}
              className="input-field font-mono text-sm resize-none"
              disabled={running}
              key={`pks-${inputKey.current}`}
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-gray-500">
                One key per line, or comma/semicolon separated
              </p>
              {privateKeys.length > 0 && (
                <span className="text-xs text-indigo-400 font-medium">
                  {privateKeys.length} wallet{privateKeys.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {privateKeys.length > 0 && !validKeys && (
              <p className="mt-1 text-xs text-red-400">
                One or more private keys have invalid format for {CHAINS[chain].name}
              </p>
            )}
          </section>

          {/* ── Amount per wallet ── */}
          <section>
            <label
              htmlFor="amount"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Amount Per Wallet
            </label>
            <div className="relative">
              <input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="Leave empty to sweep all"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                className="input-field text-lg pr-16"
                disabled={running}
                key={`amt-${inputKey.current}`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
                {nativeLabel}
              </span>
            </div>
            {isSweepAll && (
              <p className="mt-1.5 text-xs text-amber-400/80">
                Sweep mode: will send max balance minus estimated gas fees
              </p>
            )}
            {privateKeys.length > 0 && !isSweepAll && Number(amount) > 0 && (
              <p className="mt-1.5 text-xs text-gray-400">
                Total: {(Number(amount) * privateKeys.length).toLocaleString()}{' '}
                {nativeLabel} across {privateKeys.length} wallet{privateKeys.length > 1 ? 's' : ''}
              </p>
            )}
          </section>

          {/* ── EVM-only: Gas settings ── */}
          {isEVM && (
            <section>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Gas Settings (Optional)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="maxFee"
                    className="block text-xs text-gray-500 mb-1"
                  >
                    Max Fee (Gwei)
                  </label>
                  <input
                    id="maxFee"
                    type="text"
                    inputMode="decimal"
                    placeholder="Auto"
                    value={maxFeeGwei}
                    onChange={(e) => setMaxFeeGwei(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="input-field text-sm"
                    disabled={running}
                    key={`mf-${inputKey.current}`}
                  />
                </div>
                <div>
                  <label
                    htmlFor="maxPriorityFee"
                    className="block text-xs text-gray-500 mb-1"
                  >
                    Max Priority Fee (Gwei)
                  </label>
                  <input
                    id="maxPriorityFee"
                    type="text"
                    inputMode="decimal"
                    placeholder="Auto"
                    value={maxPriorityFeeGwei}
                    onChange={(e) => setMaxPriorityFeeGwei(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="input-field text-sm"
                    disabled={running}
                    key={`mpf-${inputKey.current}`}
                  />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Leave empty to auto-detect from network. Sweep mode uses legacy gas pricing for deterministic fees.
              </p>
            </section>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleCollect}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {running ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Collecting...
                </>
              ) : (
                `Start Collection${isSweepAll ? ' (Sweep All)' : ''}`
              )}
            </button>
            {(progress.length > 0 || summary || error) && (
              <button
                type="button"
                onClick={handleReset}
                className="px-5 py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm font-medium transition-all duration-200"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mt-6 glass bg-red-500/10 border-red-500/30 p-4 rounded-xl">
            <p className="text-sm text-red-400 font-medium">Error</p>
            <p className="text-sm text-red-300 mt-1">{error}</p>
          </div>
        )}

        {/* ── Progress ── */}
        {progress.length > 0 && (
          <div className="mt-6 glass p-6 md:p-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              Collection Progress
            </h2>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {progress.map((tx, i) => (
                <div
                  key={i}
                  className={`rounded-xl px-4 py-3 text-sm flex items-center gap-3 ${
                    tx.status === 'success'
                      ? 'tx-status-success'
                      : tx.status === 'failed'
                        ? 'tx-status-failed'
                        : tx.status === 'pending'
                          ? 'tx-status-pending'
                          : 'tx-status-idle'
                  }`}
                >
                  {/* Status icon */}
                  <span className="shrink-0 w-5 text-center">
                    {tx.status === 'success' && '✓'}
                    {tx.status === 'failed' && '✗'}
                    {tx.status === 'pending' && (
                      <svg
                        className="animate-spin h-4 w-4 inline"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                      </svg>
                    )}
                    {tx.status === 'idle' && '○'}
                  </span>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs truncate">
                        {truncateAddress(tx.from) || `Wallet ${i + 1}`}
                      </span>
                      <span className="text-xs opacity-70 shrink-0">
                        {tx.amount ? `${tx.amount} ${tx.symbol}` : (tx.symbol || nativeLabel)}
                      </span>
                    </div>
                    {tx.error && (
                      <p className="text-xs mt-0.5 opacity-70 truncate">
                        {tx.error}
                      </p>
                    )}
                  </div>

                  {/* Explorer link */}
                  {tx.explorerUrl && (
                    <a
                      href={tx.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs underline underline-offset-2 opacity-60 hover:opacity-100 transition-opacity"
                    >
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            {summary && (
              <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-sm">
                <div className="flex gap-4">
                  <span className="text-emerald-400">
                    ✓ {summary.collected} collected
                  </span>
                  {summary.failed > 0 && (
                    <span className="text-red-400">
                      ✗ {summary.failed} failed
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-indigo-400">
                    Total: {summary.totalAmount} {nativeLabel}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-gray-600">
          Private keys are processed in-browser and never sent to any server.
        </p>
      </div>
    </main>
  );
}
