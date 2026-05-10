'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChainId, TxProgress } from '@/lib/types';
import { CHAINS, isValidAddress, isValidPrivateKey } from '@/lib/chains';
import { distributeTokens } from '@/lib/distribute';

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

function parseRecipients(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildInitialProgress(n: number): TxProgress[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    recipient: '',
    amount: '',
    symbol: '',
    status: 'idle' as const,
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Home() {
  // Form state
  const [chain, setChain] = useState<ChainId>('eth');
  const [privateKey, setPrivateKey] = useState('');
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [amount, setAmount] = useState('');
  const [tokenType, setTokenType] = useState<'native' | 'token'>('native');
  const [tokenAddress, setTokenAddress] = useState('');

  // Tx state
  const [progress, setProgress] = useState<TxProgress[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<{
    sent: number;
    failed: number;
  } | null>(null);

  const abortRef = useRef(false);
  const inputKey = useRef(0); // force re-mount key to enable reset

  // Derived
  const recipients = parseRecipients(recipientsRaw);
  const nativeLabel = CHAINS[chain].nativeCurrency;

  // Validate
  const canSubmit =
    !running &&
    isValidPrivateKey(chain, privateKey) &&
    recipients.length > 0 &&
    Number(amount) > 0 &&
    (tokenType === 'native' || isValidAddress(chain, tokenAddress));

  // -----------------------------------------------------------------------
  // Chain switch helper – closes token address field when switching to
  // native-only mode
  // -----------------------------------------------------------------------
  const handleChainChange = useCallback((id: ChainId) => {
    setChain(id);
    setTokenType('native');
    setTokenAddress('');
    setError('');
    setSummary(null);
    setProgress([]);
  }, []);

  // -----------------------------------------------------------------------
  // Distribution runner
  // -----------------------------------------------------------------------
  const handleDistribute = useCallback(async () => {
    setError('');
    setSummary(null);
    abortRef.current = false;

    const parsed = parseRecipients(recipientsRaw);
    const init = buildInitialProgress(parsed.length);
    // Fill in recipient addresses right away
    for (let i = 0; i < parsed.length; i++) {
      init[i] = { ...init[i], recipient: parsed[i], amount };
    }
    setProgress(init);

    setRunning(true);

    const onUpdate = (i: number, p: Partial<TxProgress>) => {
      setProgress((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], ...p };
        return next;
      });
    };

    try {
      await distributeTokens(
        {
          chain,
          privateKey,
          recipients: parsed,
          isNative: tokenType === 'native',
          tokenAddress:
            tokenType === 'token' ? tokenAddress : undefined,
          amount,
        },
        onUpdate,
      );

      // Build summary
      setProgress((prev) => {
        const sent = prev.filter((t) => t.status === 'success').length;
        const failed = prev.filter((t) => t.status === 'failed').length;
        setSummary({ sent, failed });
        return prev;
      });
    } catch (err: any) {
      setError(err?.message || 'Distribution failed');
    } finally {
      setRunning(false);
    }
  }, [chain, privateKey, recipientsRaw, amount, tokenType, tokenAddress]);

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------
  const handleReset = useCallback(() => {
    setPrivateKey('');
    setRecipientsRaw('');
    setAmount('');
    setTokenType('native');
    setTokenAddress('');
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
            Token Distributor
          </h1>
          <p className="mt-2 text-gray-400">
            Send tokens to multiple wallets in one batch across ETH, BSC &amp;
            Solana
          </p>
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

          {/* ── Private key ── */}
          <section>
            <label
              htmlFor="pk"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Source Wallet Private Key
            </label>
            <input
              id="pk"
              type="password"
              placeholder={
                chain === 'sol'
                  ? 'Base58 private key or JSON byte array...'
                  : '0x...'
              }
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="input-field font-mono text-sm"
              disabled={running}
              autoComplete="off"
              key={`pk-${inputKey.current}`}
            />
            {privateKey &&
              !isValidPrivateKey(chain, privateKey) &&
              privateKey.length > 5 && (
                <p className="mt-1 text-xs text-red-400">
                  Invalid private key format for {CHAINS[chain].name}
                </p>
              )}
          </section>

          {/* ── Recipients ── */}
          <section>
            <label
              htmlFor="recipients"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Recipient Wallets
            </label>
            <textarea
              id="recipients"
              rows={5}
              placeholder={`0x1234...\n0x5678...\n0x9abc...`}
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              className="input-field font-mono text-sm resize-none"
              disabled={running}
              key={`rec-${inputKey.current}`}
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-gray-500">
                One address per line, or comma-separated
              </p>
              {recipients.length > 0 && (
                <span className="text-xs text-indigo-400 font-medium">
                  {recipients.length} wallet{recipients.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </section>

          {/* ── Token type ── */}
          <section>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Token Type
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={running}
                onClick={() => setTokenType('native')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  tokenType === 'native'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Native Coin ({nativeLabel})
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() => setTokenType('token')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  tokenType === 'token'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Token Contract
              </button>
            </div>
          </section>

          {/* ── Token contract address ── */}
          {tokenType === 'token' && (
            <section>
              <label
                htmlFor="tokenAddr"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Token Contract Address
              </label>
              <input
                id="tokenAddr"
                type="text"
                placeholder={
                  chain === 'sol'
                    ? 'Token mint address...'
                    : '0x...'
                }
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                className="input-field font-mono text-sm"
                disabled={running}
                key={`addr-${inputKey.current}`}
              />
              {tokenAddress &&
                !isValidAddress(chain, tokenAddress) &&
                tokenAddress.length > 5 && (
                  <p className="mt-1 text-xs text-red-400">
                    Invalid address format for {CHAINS[chain].name}
                  </p>
                )}
            </section>
          )}

          {/* ── Amount ── */}
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
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                className="input-field text-lg pr-16"
                disabled={running}
                key={`amt-${inputKey.current}`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
                {tokenType === 'native' ? nativeLabel : 'Token'}
              </span>
            </div>
            {recipients.length > 0 && Number(amount) > 0 && (
              <p className="mt-1.5 text-xs text-gray-400">
                Total: {(Number(amount) * recipients.length).toLocaleString()}{' '}
                {tokenType === 'native' ? nativeLabel : 'Token'} across{' '}
                {recipients.length} wallet{recipients.length > 1 ? 's' : ''}
              </p>
            )}
          </section>

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleDistribute}
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
                  Distributing...
                </>
              ) : (
                'Start Distribution'
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
              Transaction Progress
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
                        {tx.recipient}
                      </span>
                      <span className="text-xs opacity-70 shrink-0">
                        {tx.amount} {tx.symbol}
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
                    ✓ {summary.sent} sent
                  </span>
                  {summary.failed > 0 && (
                    <span className="text-red-400">
                      ✗ {summary.failed} failed
                    </span>
                  )}
                </div>
                <span className="text-gray-500">
                  {summary.sent + summary.failed} / {progress.length} complete
                </span>
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
