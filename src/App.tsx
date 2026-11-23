import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Bookmark, Check } from 'lucide-react';
import type {
  AiResearchBrief,
  PortfolioPosition,
  StockQuoteDetail,
  TimeRange,
  WatchlistQuote,
} from './types';
import { WatchlistSidebar } from './components/WatchlistSidebar';
import { StockChart } from './components/StockChart';
import { AiResearchPanel } from './components/AiResearchPanel';
import { AnalystChat } from './components/AnalystChat';
import { PeerComparisonView } from './components/PeerComparisonView';
import { ScreenerView } from './components/ScreenerView';
import { PortfolioView } from './components/PortfolioView';

type NavView = 'market' | 'research' | 'screener' | 'portfolio';

const DEFAULT_WATCHLIST = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'AMD', 'SPY'];
const BENCHMARK_SYMBOLS = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'NASDAQ' },
  { symbol: '^DJI', label: 'DOW 30' },
  { symbol: 'BTC-USD', label: 'Bitcoin' },
];

const DEFAULT_POSITIONS: PortfolioPosition[] = [
  { id: 'pos-nvda', symbol: 'NVDA', shares: 40, avgCost: 112.5 },
  { id: 'pos-msft', symbol: 'MSFT', shares: 18, avgCost: 398.0 },
  { id: 'pos-aapl', symbol: 'AAPL', shares: 25, avgCost: 204.2 },
  { id: 'pos-spy', symbol: 'SPY', shares: 15, avgCost: 532.0 },
];

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString('en-US');
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('kestrel_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('kestrel_theme', theme);
  }, [theme]);

  const [activeView, setActiveView] = useState<NavView>('market');
  const [activeSymbol, setActiveSymbol] = useState<string>('NVDA');
  const [range, setRange] = useState<TimeRange>('3mo');

  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kestrel_watchlist');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_WATCHLIST;
  });

  useEffect(() => {
    localStorage.setItem('kestrel_watchlist', JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);

  const [positions, setPositions] = useState<PortfolioPosition[]>(() => {
    try {
      const saved = localStorage.getItem('kestrel_positions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_POSITIONS;
  });

  useEffect(() => {
    localStorage.setItem('kestrel_positions', JSON.stringify(positions));
  }, [positions]);

  const [watchlistQuotes, setWatchlistQuotes] = useState<WatchlistQuote[]>([]);
  const [benchmarkQuotes, setBenchmarkQuotes] = useState<WatchlistQuote[]>([]);
  const [refreshingList, setRefreshingList] = useState(false);

  const [activeQuote, setActiveQuote] = useState<StockQuoteDetail | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [briefsCache, setBriefsCache] = useState<Record<string, AiResearchBrief>>({});
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const researchSectionRef = useRef<HTMLDivElement>(null);

  const loadWatchlistAndBenchmarks = useCallback(async () => {
    setRefreshingList(true);
    try {
      const allSyms = Array.from(
        new Set([...watchlistSymbols, ...BENCHMARK_SYMBOLS.map((b) => b.symbol)])
      );
      const res = await fetch('/api/market/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: allSyms }),
      });
      if (res.ok) {
        const data = (await res.json()) as { quotes?: WatchlistQuote[] };
        const map = new Map((data.quotes ?? []).map((q) => [q.symbol.toUpperCase(), q]));
        setWatchlistQuotes(
          watchlistSymbols
            .map((s) => map.get(s.toUpperCase()))
            .filter((q): q is WatchlistQuote => Boolean(q))
        );
        setBenchmarkQuotes(
          BENCHMARK_SYMBOLS.map((b) => map.get(b.symbol.toUpperCase())).filter(
            (q): q is WatchlistQuote => Boolean(q)
          )
        );
      }
    } finally {
      setRefreshingList(false);
    }
  }, [watchlistSymbols]);

  useEffect(() => {
    loadWatchlistAndBenchmarks();
  }, [loadWatchlistAndBenchmarks]);

  const loadActiveQuote = useCallback(async (sym: string, timeRange: TimeRange) => {
    setLoadingQuote(true);
    setQuoteError(null);
    try {
      const res = await fetch(
        `/api/market/quote/${encodeURIComponent(sym)}?range=${encodeURIComponent(timeRange)}`
      );
      const data = (await res.json()) as StockQuoteDetail & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Unable to load ${sym}`);
      }
      setActiveQuote(data);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : `Failed to load ${sym}`);
    } finally {
      setLoadingQuote(false);
    }
  }, []);

  useEffect(() => {
    loadActiveQuote(activeSymbol, range);
  }, [activeSymbol, range, loadActiveQuote]);

  const handleSelectSymbol = (sym: string) => {
    const upper = sym.trim().toUpperCase();
    setActiveSymbol(upper);
    setActiveView('market');
    setBriefError(null);
  };

  const handleAddWatchlist = (sym: string) => {
    const upper = sym.trim().toUpperCase();
    if (!upper) return;
    setWatchlistSymbols((prev) => (prev.includes(upper) ? prev : [upper, ...prev]));
  };

  const handleRemoveWatchlist = (sym: string) => {
    setWatchlistSymbols((prev) => prev.filter((s) => s !== sym));
  };

  const handleGenerateBrief = async () => {
    if (!activeQuote || loadingBrief) return;
    setActiveView('market');
    setLoadingBrief(true);
    setBriefError(null);
    setTimeout(() => {
      researchSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);

    try {
      const res = await fetch('/api/ai/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: activeQuote.symbol,
          quote: activeQuote,
        }),
      });
      const data = (await res.json()) as AiResearchBrief & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate AI research brief');
      }
      setBriefsCache((prev) => ({ ...prev, [activeQuote.symbol]: data }));
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : 'Unable to generate AI brief.');
    } finally {
      setLoadingBrief(false);
    }
  };

  const handleAddPosition = (pos: Omit<PortfolioPosition, 'id'>) => {
    setPositions((prev) => [...prev, { ...pos, id: `pos-${Date.now()}` }]);
  };

  const handleRemovePosition = (id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  };

  const isInWatchlist = watchlistSymbols.includes(activeSymbol);
  const activeBrief = briefsCache[activeSymbol] ?? null;

  const rsiValue = activeQuote?.technicals.rsi14 ?? null;
  const rsiRegime =
    rsiValue === null
      ? 'Insufficient data'
      : rsiValue >= 70
      ? 'Overbought'
      : rsiValue <= 30
      ? 'Oversold'
      : 'Neutral';

  const range52Pos =
    activeQuote && activeQuote.fiftyTwoWeekHigh > activeQuote.fiftyTwoWeekLow
      ? Math.max(
          0,
          Math.min(
            100,
            ((activeQuote.price - activeQuote.fiftyTwoWeekLow) /
              (activeQuote.fiftyTwoWeekHigh - activeQuote.fiftyTwoWeekLow)) *
              100
          )
        )
      : 50;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#090E17] text-slate-900 dark:text-slate-100">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 h-14 px-6 bg-white/95 dark:bg-[#0D131F]/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-8">
        <a
          href="#market"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('market');
          }}
          className="text-base font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          Kestrel Equity
        </a>

        <nav className="flex items-center gap-6 text-sm font-medium overflow-x-auto">
          {(
            [
              { id: 'market', label: 'Market' },
              { id: 'research', label: 'Research' },
              { id: 'screener', label: 'Screener' },
              { id: 'portfolio', label: 'Portfolio' },
            ] as const
          ).map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-blue-600 text-slate-900 dark:text-slate-100'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleGenerateBrief}
            disabled={!activeQuote || loadingBrief}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {loadingBrief ? 'Analyzing...' : 'Run AI Brief'}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row">
        <WatchlistSidebar
          watchlist={watchlistQuotes}
          activeSymbol={activeSymbol}
          onSelectSymbol={handleSelectSymbol}
          onAddSymbol={handleAddWatchlist}
          onRemoveSymbol={handleRemoveWatchlist}
          onRefresh={loadWatchlistAndBenchmarks}
          refreshing={refreshingList}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        />

        <main className="flex-1 min-w-0 flex flex-col">
          {/* Market Benchmarks Strip */}
          <div className="px-6 py-2.5 bg-white dark:bg-[#0D131F] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            {BENCHMARK_SYMBOLS.map((b) => {
              const q = benchmarkQuotes.find((item) => item.symbol === b.symbol);
              const isUp = (q?.changePercent ?? 0) >= 0;
              return (
                <button
                  key={b.symbol}
                  type="button"
                  onClick={() => handleSelectSymbol(b.symbol)}
                  className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity whitespace-nowrap shrink-0"
                >
                  <span className="font-medium text-slate-500 dark:text-slate-400">{b.label}</span>
                  {q ? (
                    <>
                      <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                        {q.price.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span
                        className={`font-mono ${
                          isUp
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isUp ? '+' : ''}
                        {q.changePercent.toFixed(2)}%
                      </span>
                    </>
                  ) : (
                    <span className="font-mono text-slate-400">—</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Primary Viewport */}
          <div className="flex-1 p-6 max-w-[1320px] w-full mx-auto">
            {activeView === 'market' && (
              <div className="space-y-6">
                {quoteError && (
                  <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-sm text-rose-700 dark:text-rose-300">
                    {quoteError}
                  </div>
                )}

                {activeQuote ? (
                  <>
                    {/* Hero Quote Strip */}
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-baseline gap-3">
                          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            {activeQuote.name}
                          </h1>
                          <span className="text-lg font-mono font-semibold text-slate-500 dark:text-slate-400">
                            {activeQuote.symbol}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                          <span>{activeQuote.exchange}</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeQuote.currency}</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeQuote.instrumentType}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {activeQuote.marketState === 'REGULAR'
                              ? 'Regular Session'
                              : activeQuote.marketState}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-6">
                        <div className="text-right">
                          <div className="text-2xl sm:text-3xl font-mono font-bold text-slate-900 dark:text-slate-100">
                            {activeQuote.price.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          <div
                            className={`inline-flex items-center gap-1 text-sm font-mono font-medium mt-0.5 ${
                              activeQuote.change >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {activeQuote.change >= 0 ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <ArrowDownRight className="w-4 h-4" />
                            )}
                            <span>
                              {activeQuote.change >= 0 ? '+' : ''}
                              {activeQuote.change.toFixed(2)} ({activeQuote.changePercent >= 0 ? '+' : ''}
                              {activeQuote.changePercent.toFixed(2)}%)
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-sans ml-1">
                              Today
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            isInWatchlist
                              ? handleRemoveWatchlist(activeQuote.symbol)
                              : handleAddWatchlist(activeQuote.symbol)
                          }
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                            isInWatchlist
                              ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {isInWatchlist ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Watching</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="w-3.5 h-3.5" />
                              <span>Watch</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Interactive Stock Chart */}
                    <StockChart
                      symbol={activeQuote.symbol}
                      currency={activeQuote.currency}
                      candles={activeQuote.candles}
                      previousClose={activeQuote.previousClose}
                      range={range}
                      onRangeChange={setRange}
                      loading={loadingQuote}
                    />

                    {/* 4-Column Quantitative Strip */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
                      <div className="p-4">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>52-Week Range</span>
                          <span className="font-mono">{range52Pos.toFixed(0)}%</span>
                        </div>
                        <div className="mt-2.5 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${range52Pos}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono text-slate-700 dark:text-slate-300 mt-2">
                          <span>{activeQuote.fiftyTwoWeekLow.toFixed(2)}</span>
                          <span>{activeQuote.fiftyTwoWeekHigh.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="text-xs text-slate-500 dark:text-slate-400">RSI (14)</div>
                        <div className="flex items-baseline gap-2 mt-1.5">
                          <span className="text-lg font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {rsiValue !== null ? rsiValue.toFixed(1) : '—'}
                          </span>
                          <span
                            className={`text-xs font-medium ${
                              rsiRegime === 'Overbought'
                                ? 'text-amber-600 dark:text-amber-400'
                                : rsiRegime === 'Oversold'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {rsiRegime}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                          MACD{' '}
                          {activeQuote.technicals.macd !== null
                            ? activeQuote.technicals.macd.toFixed(2)
                            : '—'}
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Session Volume
                        </div>
                        <div className="flex items-baseline gap-2 mt-1.5">
                          <span className="text-lg font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {formatCompactNumber(activeQuote.volume)}
                          </span>
                          {activeQuote.technicals.volumeRatio !== null && (
                            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                              {activeQuote.technicals.volumeRatio.toFixed(2)}x vs 20D
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                          Day {activeQuote.dayLow.toFixed(2)} – {activeQuote.dayHigh.toFixed(2)}
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Trend & Volatility
                        </div>
                        <div className="flex items-baseline gap-2 mt-1.5">
                          <span className="text-lg font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {activeQuote.technicals.periodReturnPercent !== null
                              ? `${
                                  activeQuote.technicals.periodReturnPercent >= 0 ? '+' : ''
                                }${activeQuote.technicals.periodReturnPercent.toFixed(2)}%`
                              : '—'}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            ({range.toUpperCase()})
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                          {activeQuote.technicals.sma20 !== null
                            ? activeQuote.price >= activeQuote.technicals.sma20
                              ? 'Above 20D SMA'
                              : 'Below 20D SMA'
                            : 'SMA pending'}
                          {activeQuote.technicals.volatilityAnnualized !== null
                            ? ` · ${activeQuote.technicals.volatilityAnnualized.toFixed(1)}% vol`
                            : ''}
                        </div>
                      </div>
                    </div>

                    {/* Split AI Research Brief + Streaming Analyst Chat */}
                    <div
                      ref={researchSectionRef}
                      className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                    >
                      <div className="lg:col-span-7">
                        <AiResearchPanel
                          symbol={activeQuote.symbol}
                          brief={activeBrief}
                          loading={loadingBrief}
                          error={briefError}
                          onGenerateBrief={handleGenerateBrief}
                          news={activeQuote.news}
                        />
                      </div>
                      <div className="lg:col-span-5">
                        <AnalystChat quote={activeQuote} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-10 space-y-4 animate-pulse">
                    <div className="h-7 w-64 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-[340px] w-full bg-slate-100 dark:bg-slate-900 rounded-lg" />
                  </div>
                )}
              </div>
            )}

            {activeView === 'research' && (
              <PeerComparisonView
                initialSymbol={activeSymbol}
                onOpenInMarket={handleSelectSymbol}
              />
            )}

            {activeView === 'screener' && (
              <ScreenerView
                onOpenInMarket={handleSelectSymbol}
                onAddWatchlist={handleAddWatchlist}
              />
            )}

            {activeView === 'portfolio' && (
              <PortfolioView
                positions={positions}
                onAddPosition={handleAddPosition}
                onRemovePosition={handleRemovePosition}
                onOpenInMarket={handleSelectSymbol}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
