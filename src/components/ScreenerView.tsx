import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Plus, Search } from 'lucide-react';
import type { ScreenerResponse } from '../types';
import { MiniSparkline } from './StockChart';

interface ScreenerViewProps {
  onOpenInMarket: (symbol: string) => void;
  onAddWatchlist: (symbol: string) => void;
}

const PRESET_THESES = [
  'AI compute and data center infrastructure leaders with strong pricing power',
  'Cash-generative cloud software compounders expanding operating margins',
  'Defensive healthcare and dividend aristocrats with resilient cash flows',
  'Semiconductor equipment and memory suppliers benefiting from HBM demand',
];

export const ScreenerView: React.FC<ScreenerViewProps> = ({
  onOpenInMarket,
  onAddWatchlist,
}) => {
  const [query, setQuery] = useState(PRESET_THESES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScreenerResponse | null>(null);

  const runScreen = async (thesisPrompt: string) => {
    const trimmed = thesisPrompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/screener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = (await res.json()) as ScreenerResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'AI Screener request failed');
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute stock screen.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runScreen(query);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Natural-Language AI Stock Screener
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Describe an investment thesis or factor profile. Matches are grounded via web search and enriched with live market prices.
        </p>
      </div>

      {/* Thesis Input */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe sectors, fundamentals, catalysts, or technical criteria..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {loading ? 'Screening Markets...' : 'Run AI Screen'}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Sample theses:</span>
          {PRESET_THESES.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setQuery(preset);
                runScreen(preset);
              }}
              className="text-left px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 animate-pulse"
            >
              <div className="h-5 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3.5 w-full bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3.5 w-4/5 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && result && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Screening Synthesis
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              {result.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.matches.map((item) => {
              const q = item.quote;
              const isUp = (q?.changePercent ?? 0) >= 0;
              return (
                <div
                  key={item.symbol}
                  className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenInMarket(item.symbol)}
                          className="text-lg font-mono font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {item.symbol}
                        </button>
                        {q && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {q.name} · {q.exchange}
                          </div>
                        )}
                      </div>

                      {q ? (
                        <div className="flex items-center gap-3 shrink-0">
                          <MiniSparkline values={q.sparkline} positive={isUp} />
                          <div className="text-right">
                            <div className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">
                              ${q.price.toFixed(2)}
                            </div>
                            <div
                              className={`inline-flex items-center gap-0.5 text-xs font-mono ${
                                isUp
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {isUp ? (
                                <ArrowUpRight className="w-3 h-3" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3" />
                              )}
                              <span>
                                {isUp ? '+' : ''}
                                {q.changePercent.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-mono text-slate-400">Quote unavailable</span>
                      )}
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      <p>{item.thesis}</p>
                      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Catalyst:{' '}
                          </span>
                          {item.catalyst}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Key Risk:{' '}
                          </span>
                          {item.risk}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {q?.rsi14 !== null && q?.rsi14 !== undefined
                        ? `RSI ${q.rsi14.toFixed(1)}`
                        : 'Live metrics'}
                      {q?.periodReturn1M !== null && q?.periodReturn1M !== undefined
                        ? ` · 1M ${q.periodReturn1M >= 0 ? '+' : ''}${q.periodReturn1M.toFixed(1)}%`
                        : ''}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAddWatchlist(item.symbol)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Watchlist</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenInMarket(item.symbol)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 whitespace-nowrap shrink-0"
                      >
                        Open Terminal
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {result.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Sources:</span>
              {result.sources.map((s, idx) => (
                <a
                  key={idx}
                  href={s.uri}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <span>{s.title}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
