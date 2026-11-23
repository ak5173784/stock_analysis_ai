import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { GroundingSource, PortfolioPosition, WatchlistQuote } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface PortfolioViewProps {
  positions: PortfolioPosition[];
  onAddPosition: (pos: Omit<PortfolioPosition, 'id'>) => void;
  onRemovePosition: (id: string) => void;
  onOpenInMarket: (symbol: string) => void;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  positions,
  onAddPosition,
  onRemovePosition,
  onOpenInMarket,
}) => {
  const [symbolInput, setSymbolInput] = useState('');
  const [sharesInput, setSharesInput] = useState('');
  const [costInput, setCostInput] = useState('');

  const [quotesMap, setQuotesMap] = useState<Map<string, WatchlistQuote>>(new Map());
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  const [audit, setAudit] = useState<{
    markdown: string;
    sources: GroundingSource[];
  } | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const symbolsKey = useMemo(
    () => Array.from(new Set(positions.map((p) => p.symbol.toUpperCase()))).sort().join(','),
    [positions]
  );

  useEffect(() => {
    const syms = symbolsKey ? symbolsKey.split(',') : [];
    if (syms.length === 0) {
      setQuotesMap(new Map());
      return;
    }
    let cancelled = false;
    setLoadingQuotes(true);
    fetch('/api/market/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: syms }),
    })
      .then((res) => res.json())
      .then((data: { quotes?: WatchlistQuote[] }) => {
        if (cancelled) return;
        const next = new Map<string, WatchlistQuote>();
        for (const q of data.quotes ?? []) {
          next.set(q.symbol.toUpperCase(), q);
        }
        setQuotesMap(next);
      })
      .finally(() => {
        if (!cancelled) setLoadingQuotes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbolsKey]);

  const enriched = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let totalDayPnl = 0;

    const rows = positions.map((pos) => {
      const q = quotesMap.get(pos.symbol.toUpperCase());
      const currentPrice = q?.price ?? pos.avgCost;
      const marketValue = pos.shares * currentPrice;
      const costBasis = pos.shares * pos.avgCost;
      const unrealizedPnl = marketValue - costBasis;
      const unrealizedPnlPercent = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
      const dayPnl = q ? pos.shares * q.change : 0;

      totalValue += marketValue;
      totalCost += costBasis;
      totalDayPnl += dayPnl;

      return {
        ...pos,
        name: q?.name || pos.symbol,
        currentPrice,
        marketValue,
        costBasis,
        unrealizedPnl,
        unrealizedPnlPercent,
        dayPnl,
        dayChangePercent: q?.changePercent ?? 0,
      };
    });

    const totalPnl = totalValue - totalCost;
    const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const prevValue = totalValue - totalDayPnl;
    const totalDayPercent = prevValue > 0 ? (totalDayPnl / prevValue) * 100 : 0;

    return {
      rows: rows.map((r) => ({
        ...r,
        weightPercent: totalValue > 0 ? (r.marketValue / totalValue) * 100 : 0,
      })),
      totalValue,
      totalCost,
      totalPnl,
      totalPnlPercent,
      totalDayPnl,
      totalDayPercent,
    };
  }, [positions, quotesMap]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = symbolInput.trim().toUpperCase();
    const sh = Number(sharesInput);
    const cost = Number(costInput);
    if (!sym || !Number.isFinite(sh) || sh <= 0 || !Number.isFinite(cost) || cost <= 0) {
      return;
    }
    onAddPosition({ symbol: sym, shares: sh, avgCost: cost });
    setSymbolInput('');
    setSharesInput('');
    setCostInput('');
    setAudit(null);
  };

  const handleRunAudit = async () => {
    if (enriched.rows.length === 0 || loadingAudit) return;
    setLoadingAudit(true);
    setAuditError(null);
    try {
      const res = await fetch('/api/ai/portfolio-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings: enriched.rows,
          totalValue: enriched.totalValue,
          totalPnlPercent: enriched.totalPnlPercent,
        }),
      });
      const data = (await res.json()) as {
        markdown?: string;
        sources?: GroundingSource[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Portfolio audit failed');
      }
      setAudit({
        markdown: data.markdown ?? '',
        sources: data.sources ?? [],
      });
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Unable to complete AI audit.');
    } finally {
      setLoadingAudit(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Portfolio Tracker & Risk Audit
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track live market valuation, position weights, and run Gemini portfolio concentration audits.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRunAudit}
          disabled={loadingAudit || enriched.rows.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
          <span>Run AI Risk Audit</span>
        </button>
      </div>

      {/* 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Market Value</div>
          <div className="text-xl font-mono font-semibold text-slate-900 dark:text-slate-100 mt-1">
            ${enriched.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
            {enriched.rows.length} positions {loadingQuotes ? '· updating' : ''}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Cost Basis</div>
          <div className="text-xl font-mono font-semibold text-slate-900 dark:text-slate-100 mt-1">
            ${enriched.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Committed capital</div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Unrealized P&L</div>
          <div
            className={`text-xl font-mono font-semibold mt-1 ${
              enriched.totalPnl >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {enriched.totalPnl >= 0 ? '+' : '-'}$
            {Math.abs(enriched.totalPnl).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div
            className={`text-xs font-mono mt-0.5 ${
              enriched.totalPnlPercent >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {enriched.totalPnlPercent >= 0 ? '+' : ''}
            {enriched.totalPnlPercent.toFixed(2)}% total return
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Session Change</div>
          <div
            className={`text-xl font-mono font-semibold mt-1 ${
              enriched.totalDayPnl >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {enriched.totalDayPnl >= 0 ? '+' : '-'}$
            {Math.abs(enriched.totalDayPnl).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div
            className={`text-xs font-mono mt-0.5 ${
              enriched.totalDayPercent >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {enriched.totalDayPercent >= 0 ? '+' : ''}
            {enriched.totalDayPercent.toFixed(2)}% today
          </div>
        </div>
      </div>

      {/* Add Position Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-end gap-3"
      >
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Ticker Symbol
          </label>
          <input
            type="text"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="e.g. NVDA"
            required
            className="w-full px-3 py-2 text-sm font-mono uppercase bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:normal-case placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        <div className="w-32">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Shares</label>
          <input
            type="number"
            step="any"
            min="0.0001"
            value={sharesInput}
            onChange={(e) => setSharesInput(e.target.value)}
            placeholder="25"
            required
            className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        <div className="w-36">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Avg Cost ($)
          </label>
          <input
            type="number"
            step="any"
            min="0.01"
            value={costInput}
            onChange={(e) => setCostInput(e.target.value)}
            placeholder="118.50"
            required
            className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Position</span>
        </button>
      </form>

      {/* Holdings Table */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {enriched.rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No positions logged yet. Add a ticker, share count, and cost basis above to track live valuation.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-4 text-right">Shares</th>
                  <th className="py-3 px-4 text-right">Avg Cost</th>
                  <th className="py-3 px-4 text-right">Live Price</th>
                  <th className="py-3 px-4 text-right">Market Value</th>
                  <th className="py-3 px-4 text-right">Weight</th>
                  <th className="py-3 px-4 text-right">Unrealized P&L</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {enriched.rows.map((row) => {
                  const isUp = row.unrealizedPnl >= 0;
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onOpenInMarket(row.symbol)}
                          className="text-left group"
                        >
                          <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            {row.symbol}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                            {row.name}
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                        {row.shares}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                        ${row.avgCost.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-slate-100">
                        ${row.currentPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 dark:text-slate-100">
                        ${row.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                        {row.weightPercent.toFixed(1)}%
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono ${
                          isUp
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        <div className="inline-flex items-center justify-end gap-0.5">
                          {isUp ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isUp ? '+' : '-'}${Math.abs(row.unrealizedPnl).toFixed(2)} (
                            {isUp ? '+' : ''}
                            {row.unrealizedPnlPercent.toFixed(2)}%)
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onRemovePosition(row.id)}
                          aria-label={`Remove ${row.symbol} position`}
                          className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Risk Audit Output */}
      {(audit || loadingAudit || auditError) && (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            AI Portfolio Risk & Concentration Audit
          </h3>
          {auditError && (
            <div className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-sm text-rose-700 dark:text-rose-300">
              {auditError}
            </div>
          )}
          {loadingAudit ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 w-44 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3.5 w-full bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3.5 w-11/12 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ) : (
            audit && (
              <>
                <MarkdownRenderer content={audit.markdown} />
                {audit.sources.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-3">
                    {audit.sources.map((s, idx) => (
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
