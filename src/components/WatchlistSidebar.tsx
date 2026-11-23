import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sun,
  X,
} from 'lucide-react';
import type { SearchResult, WatchlistQuote } from '../types';
import { MiniSparkline } from './StockChart';

interface WatchlistSidebarProps {
  watchlist: WatchlistQuote[];
  activeSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onAddSymbol: (symbol: string) => void;
  onRemoveSymbol: (symbol: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const WatchlistSidebar: React.FC<WatchlistSidebarProps> = ({
  watchlist,
  activeSymbol,
  onSelectSymbol,
  onAddSymbol,
  onRemoveSymbol,
  onRefresh,
  refreshing,
  theme,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = (await res.json()) as { results?: SearchResult[] };
          setResults(data.results ?? []);
          setDropdownOpen(true);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSearchResult = (sym: string, addOnly = false) => {
    onAddSymbol(sym);
    if (!addOnly) {
      onSelectSymbol(sym);
    }
    setQuery('');
    setResults([]);
    setDropdownOpen(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = query.trim().toUpperCase();
    if (!sym) return;
    if (results.length > 0) {
      handleSelectSearchResult(results[0].symbol);
    } else {
      handleSelectSearchResult(sym);
    }
  };

  return (
    <aside className="w-full lg:w-[272px] shrink-0 bg-white dark:bg-[#0D131F] border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col">
      {/* Live Ticker Search */}
      <div ref={containerRef} className="relative p-4 border-b border-slate-200 dark:border-slate-800">
        <form onSubmit={handleFormSubmit} className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onFocus={() => {
              if (results.length > 0) setDropdownOpen(true);
            }}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker or company"
            aria-label="Search ticker or company"
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                setDropdownOpen(false);
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        {dropdownOpen && (results.length > 0 || searching) && (
          <div className="absolute left-4 right-4 top-[58px] z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
            {searching ? (
              <div className="px-3 py-2.5 text-xs text-slate-500 font-mono">Searching market...</div>
            ) : (
              results.map((item) => (
                <div
                  key={item.symbol}
                  className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/80 border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectSearchResult(item.symbol)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {item.symbol}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate">
                        {item.exchange} · {item.type}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      {item.name}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSearchResult(item.symbol, true)}
                    title={`Add ${item.symbol} to watchlist`}
                    className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Watchlist Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/80">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide">
          Watchlist
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Watchlist Items */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70 max-h-[320px] lg:max-h-none">
        {watchlist.length === 0 ? (
          <div className="p-5 text-xs text-slate-500 dark:text-slate-400">
            Search any ticker above to monitor live prices and technicals.
          </div>
        ) : (
          watchlist.map((item) => {
            const isActive = item.symbol === activeSymbol;
            const isUp = item.change >= 0;
            return (
              <div
                key={item.symbol}
                className={`group flex items-center justify-between gap-2 px-4 py-3 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-50/70 dark:bg-blue-950/25'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-900/60'
                }`}
                onClick={() => onSelectSymbol(item.symbol)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-sm font-mono font-semibold ${
                        isActive
                          ? 'text-blue-700 dark:text-blue-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {item.symbol}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {item.name}
                  </div>
                </div>

                <MiniSparkline values={item.sparkline} positive={isUp} width={48} height={18} />

                <div className="text-right shrink-0 ml-1">
                  <div className="text-xs font-mono font-medium text-slate-900 dark:text-slate-100">
                    {item.price.toFixed(2)}
                  </div>
                  <div
                    className={`inline-flex items-center justify-end gap-0.5 text-[11px] font-mono font-medium ${
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
                      {item.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSymbol(item.symbol);
                  }}
                  aria-label={`Remove ${item.symbol}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-rose-500 transition-opacity shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Theme Switch */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">Appearance</span>
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
