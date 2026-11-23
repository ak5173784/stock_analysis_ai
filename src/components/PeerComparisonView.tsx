import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Plus, RefreshCw, X } from 'lucide-react';
import type { GroundingSource, WatchlistQuote } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface PeerComparisonViewProps {
  initialSymbol: string;
  onOpenInMarket: (symbol: string) => void;
}

const PEER_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EC4899'];

const DEFAULT_PEER_GROUPS: Record<string, string[]> = {
  NVDA: ['NVDA', 'AMD', 'AVGO', 'MSFT'],
  AAPL: ['AAPL', 'MSFT', 'GOOGL', 'AMZN'],
  TSLA: ['TSLA', 'TM', 'GM', 'F'],
};

export const PeerComparisonView: React.FC<PeerComparisonViewProps> = ({
  initialSymbol,
  onOpenInMarket,
}) => {
  const [symbols, setSymbols] = useState<string[]>(() => {
    const preset = DEFAULT_PEER_GROUPS[initialSymbol];
    if (preset) return preset;
    return [initialSymbol, 'MSFT', 'AAPL', 'SPY'].filter((v, i, a) => a.indexOf(v) === i);
  });
  const [newTicker, setNewTicker] = useState('');
  const [quotes, setQuotes] = useState<WatchlistQuote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  const [memo, setMemo] = useState<{
    markdown: string;
    sources: GroundingSource[];
  } | null>(null);
  const [loadingMemo, setLoadingMemo] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);

  const loadQuotes = async (syms: string[]) => {
    if (syms.length === 0) {
      setQuotes([]);
      return;
    }
    setLoadingQuotes(true);
    try {
      const res = await fetch('/api/market/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: syms }),
      });
      if (res.ok) {
        const data = (await res.json()) as { quotes?: WatchlistQuote[] };
        setQuotes(data.quotes ?? []);
      }
    } finally {
      setLoadingQuotes(false);
    }
  };

  useEffect(() => {
    loadQuotes(symbols);
  }, [symbols]);

  const handleAddPeer = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = newTicker.trim().toUpperCase();
    if (!sym || symbols.includes(sym) || symbols.length >= 4) return;
    setSymbols((prev) => [...prev, sym]);
    setNewTicker('');
    setMemo(null);
  };

  const handleRemovePeer = (sym: string) => {
    if (symbols.length <= 1) return;
    setSymbols((prev) => prev.filter((s) => s !== sym));
    setMemo(null);
  };

  const handleGenerateMemo = async () => {
    if (quotes.length < 2) return;
    setLoadingMemo(true);
    setMemoError(null);
    try {
      const res = await fetch('/api/ai/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peers: quotes }),
      });
      const data = (await res.json()) as {
        markdown?: string;
        sources?: GroundingSource[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Peer comparison failed');
      }
      setMemo({
        markdown: data.markdown ?? '',
        sources: data.sources ?? [],
      });
    } catch (err) {
      setMemoError(err instanceof Error ? err.message : 'Unable to generate comparison memo.');
    } finally {
      setLoadingMemo(false);
    }
  };

  // Normalized 1M relative performance SVG paths
  const chartData = useMemo(() => {
    const valid = quotes.filter((q) => q.sparkline.length >= 2);
    if (valid.length === 0) return null;

    const normalized = valid.map((q, idx) => {
      const base = q.sparkline[0] || 1;
      const pcts = q.sparkline.map((v) => ((v - base) / base) * 100);
      return { symbol: q.symbol, color: PEER_COLORS[idx % PEER_COLORS.length], pcts };
    });

    const allPcts = normalized.flatMap((n) => n.pcts);
    const minY = Math.min(...allPcts, 0);
    const maxY = Math.max(...allPcts, 0);
    const pad = Math.max(2, (maxY - minY) * 0.12);

    return {
      series: normalized,
      minY: minY - pad,
      maxY: maxY + pad,
    };
  }, [quotes]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Peer Comparison & Relative Momentum
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Compare up to 4 equities side-by-side across 1-month normalized performance and quantitative metrics.
          </p>
        </div>

        <form onSubmit={handleAddPeer} className="flex items-center gap-2">
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            placeholder="Add ticker (e.g. AVGO)"
            disabled={symbols.length >= 4}
            className="w-40 px-3 py-2 text-sm font-mono uppercase bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:normal-case placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            type="submit"
            disabled={!newTicker.trim() || symbols.length >= 4}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Peer</span>
          </button>
          <button
            type="button"
            onClick={handleGenerateMemo}
            disabled={loadingMemo || quotes.length < 2}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingMemo ? 'animate-spin' : ''}`} />
            <span>Compare with AI</span>
          </button>
        </form>
      </div>

      {/* Active Peer Chips (Functional removable controls) */}
      <div className="flex flex-wrap items-center gap-2">
        {symbols.map((sym, idx) => (
          <div
            key={sym}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-mono"
          >
            <span
              className="w-2.5 h-0.5 rounded-xs"
              style={{ backgroundColor: PEER_COLORS[idx % PEER_COLORS.length] }}
            />
            <button
              type="button"
              onClick={() => onOpenInMarket(sym)}
              className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
            >
              {sym}
            </button>
            {symbols.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemovePeer(sym)}
                aria-label={`Remove ${sym}`}
                className="text-slate-400 hover:text-rose-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Normalized Performance Chart */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              1-Month Normalized Return (%)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Indexed to 0.0% at start of 22-session window
            </p>
          </div>
          {chartData && (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              {chartData.series.map((s) => {
                const lastPct = s.pcts[s.pcts.length - 1] ?? 0;
                return (
                  <span key={s.symbol} className="inline-flex items-center gap-1.5">
                    <span
                      className="w-3 h-0.5 inline-block"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-slate-700 dark:text-slate-300">{s.symbol}</span>
                    <span
                      className={
                        lastPct >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {lastPct >= 0 ? '+' : ''}
                      {lastPct.toFixed(2)}%
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {chartData ? (
          <svg viewBox="0 0 860 220" className="w-full h-auto">
            {(() => {
              const W = 860;
              const H = 220;
              const PL = 12;
              const PR = 54;
              const PT = 14;
              const PB = 18;
              const CW = W - PL - PR;
              const CH = H - PT - PB;
              const span = chartData.maxY - chartData.minY || 1;
              const yFor = (val: number) => PT + CH - ((val - chartData.minY) / span) * CH;
              const zeroY = yFor(0);
              const ticks = [chartData.minY, 0, chartData.maxY];

              return (
                <>
                  {ticks.map((t, i) => (
                    <g key={i}>
                      <line
                        x1={PL}
                        y1={yFor(t)}
                        x2={PL + CW}
                        y2={yFor(t)}
                        className={
                          t === 0
                            ? 'stroke-slate-300 dark:stroke-slate-700'
                            : 'stroke-slate-100 dark:stroke-slate-800/80'
                        }
                        strokeDasharray={t === 0 ? undefined : '3 3'}
                      />
                      <text
                        x={PL + CW + 8}
                        y={yFor(t) + 4}
                        className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                      >
                        {t >= 0 ? '+' : ''}
                        {t.toFixed(1)}%
                      </text>
                    </g>
                  ))}
                  {zeroY >= PT && zeroY <= PT + CH && (
                    <line
                      x1={PL}
                      y1={zeroY}
                      x2={PL + CW}
                      y2={zeroY}
                      className="stroke-slate-400/50 dark:stroke-slate-600/60"
                      strokeWidth="1"
                    />
                  )}
                  {chartData.series.map((s) => {
                    const d = s.pcts
                      .map((p, i) => {
                        const x = PL + (i / Math.max(1, s.pcts.length - 1)) * CW;
                        const y = yFor(p);
                        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(' ');
                    return (
                      <path
                        key={s.symbol}
                        d={d}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    );
                  })}
                </>
              );
            })()}
          </svg>
        ) : (
          <div className="h-44 flex items-center justify-center text-sm text-slate-500">
            {loadingQuotes ? 'Loading peer market series...' : 'Add tickers to view comparative performance.'}
          </div>
        )}
      </div>

      {/* Tabular Peer Matrix */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Ticker</th>
                <th className="py-3 px-4 text-right">Price</th>
                <th className="py-3 px-4 text-right">Today</th>
                <th className="py-3 px-4 text-right">1M Return</th>
                <th className="py-3 px-4 text-right">RSI (14)</th>
                <th className="py-3 px-4 text-right">Ann. Vol</th>
                <th className="py-3 px-4 text-right">Vol / 20D</th>
                <th className="py-3 px-4 text-right">52W Range</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {quotes.map((q) => {
                const isUp = q.changePercent >= 0;
                const pos52 =
                  q.fiftyTwoWeekHigh > q.fiftyTwoWeekLow
                    ? ((q.price - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)) *
                      100
                    : 50;
                return (
                  <tr
                    key={q.symbol}
                    className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onOpenInMarket(q.symbol)}
                        className="text-left group"
                      >
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {q.symbol}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                          {q.name}
                        </div>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-slate-100">
                      ${q.price.toFixed(2)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono ${
                        isUp
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {isUp ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        )}
                        {isUp ? '+' : ''}
                        {q.changePercent.toFixed(2)}%
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono ${
                        (q.periodReturn1M ?? 0) >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {q.periodReturn1M !== null
                        ? `${q.periodReturn1M >= 0 ? '+' : ''}${q.periodReturn1M.toFixed(2)}%`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                      {q.rsi14 !== null ? q.rsi14.toFixed(1) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                      {q.volatilityAnnualized !== null ? `${q.volatilityAnnualized.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                      {q.volumeRatio !== null ? `${q.volumeRatio.toFixed(2)}x` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400">
                      {Math.max(0, Math.min(100, pos52)).toFixed(0)}% of hi
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Comparative Memo */}
      {(memo || loadingMemo || memoError) && (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            AI Comparative Peer Memo
          </h3>
          {memoError && (
            <div className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-sm text-rose-700 dark:text-rose-300">
              {memoError}
            </div>
          )}
          {loadingMemo ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3.5 w-full bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3.5 w-5/6 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ) : (
            memo && (
              <>
                <MarkdownRenderer content={memo.markdown} />
                {memo.sources.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-3">
                    {memo.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <span>{s.title}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
};
