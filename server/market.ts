import type {
  CandlePoint,
  NewsItem,
  SearchResult,
  StockQuoteDetail,
  TechnicalIndicators,
  TimeRange,
  WatchlistQuote,
} from '../src/types.ts';

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const quoteCache = new Map<string, CacheEntry<StockQuoteDetail>>();
const watchlistCache = new Map<string, CacheEntry<WatchlistQuote>>();

const RANGE_INTERVAL_MAP: Record<TimeRange, string> = {
  '5d': '15m',
  '1mo': '1d',
  '3mo': '1d',
  '6mo': '1d',
  '1y': '1d',
  '2y': '1wk',
};

function computeSma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  let runningSum = 0;
  for (let i = 0; i < values.length; i++) {
    runningSum += values[i];
    if (i >= period) {
      runningSum -= values[i - period];
    }
    if (i >= period - 1) {
      result[i] = Number((runningSum / period).toFixed(4));
    }
  }
  return result;
}

function computeEma(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const emas: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    emas.push(values[i] * k + emas[i - 1] * (1 - k));
  }
  return emas;
}

function computeRsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= 14; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / 14;
  let avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

function computeMacd(closes: number[]): { macd: number | null; signal: number | null } {
  if (closes.length < 35) return { macd: null, signal: null };
  const ema12 = computeEma(closes, 12);
  const ema26 = computeEma(closes, 26);
  const macdLine = closes.map((_, idx) => ema12[idx] - ema26[idx]);
  const signalLine = computeEma(macdLine.slice(25), 9);
  const latestMacd = macdLine[macdLine.length - 1];
  const latestSignal = signalLine[signalLine.length - 1];
  return {
    macd: Number(latestMacd.toFixed(3)),
    signal: Number(latestSignal.toFixed(3)),
  };
}

function computeVolatility(closes: number[]): number | null {
  if (closes.length < 10) return null;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  if (returns.length < 5) return null;
  const mean = returns.reduce((acc, v) => acc + v, 0) / returns.length;
  const variance =
    returns.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (returns.length - 1);
  const annualized = Math.sqrt(variance) * Math.sqrt(252) * 100;
  return Number(annualized.toFixed(2));
}

function formatDateLabel(unixSec: number, range: TimeRange): string {
  const date = new Date(unixSec * 1000);
  if (range === '5d') {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: range === '1y' || range === '2y' ? '2-digit' : undefined,
  });
}

export async function searchTickers(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    trimmed
  )}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`;

  const res = await fetch(url, { headers: YAHOO_HEADERS });
  if (!res.ok) {
    throw new Error(`Ticker search failed with status ${res.status}`);
  }
  const data = (await res.json()) as {
    quotes?: Array<{
      symbol?: string;
      shortname?: string;
      longname?: string;
      exchDisp?: string;
      exchange?: string;
      quoteType?: string;
      typeDisp?: string;
      sectorDisp?: string;
    }>;
  };

  return (data.quotes ?? [])
    .filter((item) => item.symbol && item.quoteType !== 'OPTION')
    .slice(0, 8)
    .map((item) => ({
      symbol: item.symbol ?? '',
      name: item.longname || item.shortname || item.symbol || '',
      exchange: item.exchDisp || item.exchange || 'Market',
      type: item.typeDisp || item.quoteType || 'Equity',
      sector: item.sectorDisp,
    }));
}

export async function fetchTickerNews(symbol: string): Promise<NewsItem[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      symbol
    )}&quotesCount=1&newsCount=6`;
    const res = await fetch(url, { headers: YAHOO_HEADERS });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      news?: Array<{
        uuid?: string;
        title?: string;
        publisher?: string;
        link?: string;
        providerPublishTime?: number;
      }>;
    };
    return (data.news ?? [])
      .filter((n) => n.title && n.link)
      .slice(0, 6)
      .map((n, index) => ({
        id: n.uuid || `${symbol}-${index}`,
        title: n.title ?? '',
        publisher: n.publisher || 'Market Wire',
        link: n.link ?? '',
        publishedAt: n.providerPublishTime ?? Math.floor(Date.now() / 1000),
      }));
  } catch {
    return [];
  }
}

export async function fetchStockQuoteDetail(
  rawSymbol: string,
  range: TimeRange = '3mo'
): Promise<StockQuoteDetail> {
  const symbol = rawSymbol.trim().toUpperCase();
  const validRange: TimeRange = range in RANGE_INTERVAL_MAP ? range : '3mo';
  const cacheKey = `${symbol}:${validRange}`;

  const cached = quoteCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const interval = RANGE_INTERVAL_MAP[validRange];
  // Fetch slightly deeper daily history (6mo) when range is 1mo or 3mo? No, fetch requested range, and for technicals on short ranges, fetch 6mo daily if needed.
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${validRange}&interval=${interval}&includePrePost=false`;

  const [chartRes, dailyRes, news] = await Promise.all([
    fetch(chartUrl, { headers: YAHOO_HEADERS }),
    validRange === '5d' || validRange === '1mo' || validRange === '2y'
      ? fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            symbol
          )}?range=6mo&interval=1d&includePrePost=false`,
          { headers: YAHOO_HEADERS }
        )
      : Promise.resolve(null),
    fetchTickerNews(symbol),
  ]);

  if (!chartRes.ok) {
    throw new Error(`Market data unavailable for ${symbol} (HTTP ${chartRes.status})`);
  }

  const chartJson = (await chartRes.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          symbol?: string;
          longName?: string;
          shortName?: string;
          exchangeName?: string;
          fullExchangeName?: string;
          currency?: string;
          instrumentType?: string;
          marketState?: string;
          regularMarketPrice?: number;
          regularMarketChange?: number;
          regularMarketChangePercent?: number;
          fulldayChange?: number;
          fulldayChangePercent?: number;
          chartPreviousClose?: number;
          previousClose?: number;
          regularMarketDayHigh?: number;
          regularMarketDayLow?: number;
          fiftyTwoWeekHigh?: number;
          fiftyTwoWeekLow?: number;
          regularMarketVolume?: number;
        };
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
      error?: { description?: string };
    };
  };

  const result = chartJson.chart?.result?.[0];
  if (!result || !result.meta) {
    const errMsg = chartJson.chart?.error?.description || `No quote found for ${symbol}`;
    throw new Error(errMsg);
  }

  const meta = result.meta;
  const timestamps = result.timestamp ?? [];
  const rawQuote = result.indicators?.quote?.[0] ?? {};
  const opens = rawQuote.open ?? [];
  const highs = rawQuote.high ?? [];
  const lows = rawQuote.low ?? [];
  const closes = rawQuote.close ?? [];
  const volumes = rawQuote.volume ?? [];

  const rawPoints: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];

  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    const o = opens[i] ?? c;
    const h = highs[i] ?? c;
    const l = lows[i] ?? c;
    const v = volumes[i] ?? 0;
    if (typeof c === 'number' && Number.isFinite(c) && typeof o === 'number') {
      rawPoints.push({
        time: timestamps[i],
        open: Number(o.toFixed(4)),
        high: Number((typeof h === 'number' ? h : Math.max(o, c)).toFixed(4)),
        low: Number((typeof l === 'number' ? l : Math.min(o, c)).toFixed(4)),
        close: Number(c.toFixed(4)),
        volume: typeof v === 'number' ? v : 0,
      });
    }
  }

  const closeSeries = rawPoints.map((p) => p.close);
  const sma20Arr = computeSma(closeSeries, 20);
  const sma50Arr = computeSma(closeSeries, 50);

  const candles: CandlePoint[] = rawPoints.map((pt, idx) => ({
    ...pt,
    dateLabel: formatDateLabel(pt.time, validRange),
    sma20: sma20Arr[idx],
    sma50: sma50Arr[idx],
  }));

  // Use 6mo daily closes for robust RSI/SMA/MACD/Volatility when viewing 5d or 1mo
  let techCloses = closeSeries;
  let techVolumes = rawPoints.map((p) => p.volume);

  if (dailyRes && dailyRes.ok) {
    try {
      const dailyJson = (await dailyRes.json()) as typeof chartJson;
      const dailyResult = dailyJson.chart?.result?.[0];
      const dCloses = dailyResult?.indicators?.quote?.[0]?.close ?? [];
      const dVols = dailyResult?.indicators?.quote?.[0]?.volume ?? [];
      const validDailyCloses: number[] = [];
      const validDailyVols: number[] = [];
      for (let i = 0; i < dCloses.length; i++) {
        const dc = dCloses[i];
        if (typeof dc === 'number' && Number.isFinite(dc)) {
          validDailyCloses.push(dc);
          validDailyVols.push(dVols[i] ?? 0);
        }
      }
      if (validDailyCloses.length >= 20) {
        techCloses = validDailyCloses;
        techVolumes = validDailyVols;
      }
    } catch {
      // keep range closes
    }
  }

  const techSma20 = computeSma(techCloses, 20);
  const techSma50 = computeSma(techCloses, 50);
  const latestSma20 = techSma20[techSma20.length - 1] ?? null;
  const latestSma50 = techSma50[techSma50.length - 1] ?? null;
  const rsi14 = computeRsi14(techCloses);
  const { macd, signal } = computeMacd(techCloses);
  const volatilityAnnualized = validRange === '2y' ? null : computeVolatility(techCloses);

  const recentVols = techVolumes.slice(-20).filter((v) => v > 0);
  const avgVolume20 =
    recentVols.length > 0
      ? Math.round(recentVols.reduce((a, b) => a + b, 0) / recentVols.length)
      : null;

  const currentPrice =
    meta.regularMarketPrice ?? (closeSeries.length > 0 ? closeSeries[closeSeries.length - 1] : 0);

  const prevDailyClose =
    techCloses.length >= 2 ? techCloses[techCloses.length - 2] : currentPrice;
  const fallbackPrevClose = meta.previousClose ?? prevDailyClose;

  const rawChange =
    meta.fulldayChange ??
    meta.regularMarketChange ??
    (fallbackPrevClose > 0 ? currentPrice - fallbackPrevClose : 0);
  const rawChangePct =
    meta.regularMarketChangePercent ??
    meta.fulldayChangePercent ??
    (fallbackPrevClose > 0 ? (rawChange / fallbackPrevClose) * 100 : 0);

  const prevClose = Number((currentPrice - rawChange).toFixed(4));
  const change = Number(rawChange.toFixed(4));
  const changePercent = Number(rawChangePct.toFixed(2));

  const firstRangeClose = closeSeries.length > 0 ? closeSeries[0] : currentPrice;
  const periodReturnPercent =
    firstRangeClose > 0
      ? Number((((currentPrice - firstRangeClose) / firstRangeClose) * 100).toFixed(2))
      : null;

  const currentVol = meta.regularMarketVolume ?? (rawPoints.at(-1)?.volume || 0);
  const volumeRatio =
    avgVolume20 && avgVolume20 > 0 && currentVol > 0
      ? Number((currentVol / avgVolume20).toFixed(2))
      : null;

  const detail: StockQuoteDetail = {
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || symbol,
    exchange: meta.fullExchangeName || meta.exchangeName || 'Market',
    currency: meta.currency || 'USD',
    instrumentType: meta.instrumentType || 'EQUITY',
    marketState: meta.marketState || 'REGULAR',
    price: Number(currentPrice.toFixed(2)),
    previousClose: Number(prevClose.toFixed(2)),
    change: Number(change.toFixed(2)),
    changePercent,
    dayHigh: Number((meta.regularMarketDayHigh ?? currentPrice).toFixed(2)),
    dayLow: Number((meta.regularMarketDayLow ?? currentPrice).toFixed(2)),
    fiftyTwoWeekHigh: Number((meta.fiftyTwoWeekHigh ?? currentPrice).toFixed(2)),
    fiftyTwoWeekLow: Number((meta.fiftyTwoWeekLow ?? currentPrice).toFixed(2)),
    volume: currentVol,
    range: validRange,
    candles,
    technicals: {
      rsi14,
      sma20: latestSma20 ? Number(latestSma20.toFixed(2)) : null,
      sma50: latestSma50 ? Number(latestSma50.toFixed(2)) : null,
      macd,
      macdSignal: signal,
      avgVolume20,
      volumeRatio,
      volatilityAnnualized,
      periodReturnPercent,
    },
    news,
  };

  quoteCache.set(cacheKey, {
    value: detail,
    expiresAt: Date.now() + 25_000,
  });

  return detail;
}

export async function fetchWatchlistQuote(rawSymbol: string): Promise<WatchlistQuote | null> {
  const symbol = rawSymbol.trim().toUpperCase();
  const cached = watchlistCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?range=3mo&interval=1d&includePrePost=false`;
    const res = await fetch(url, { headers: YAHOO_HEADERS });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            symbol?: string;
            longName?: string;
            shortName?: string;
            exchangeName?: string;
            fullExchangeName?: string;
            currency?: string;
            regularMarketPrice?: number;
            regularMarketChange?: number;
            regularMarketChangePercent?: number;
            fulldayChange?: number;
            fulldayChangePercent?: number;
            previousClose?: number;
            chartPreviousClose?: number;
            fiftyTwoWeekHigh?: number;
            fiftyTwoWeekLow?: number;
            regularMarketVolume?: number;
          };
          indicators?: {
            quote?: Array<{
              close?: Array<number | null>;
              volume?: Array<number | null>;
            }>;
          };
        }>;
      };
    };

    const result = json.chart?.result?.[0];
    if (!result?.meta) return null;

    const meta = result.meta;
    const rawCloses = result.indicators?.quote?.[0]?.close ?? [];
    const rawVols = result.indicators?.quote?.[0]?.volume ?? [];
    const closes: number[] = [];
    const vols: number[] = [];

    for (let i = 0; i < rawCloses.length; i++) {
      const c = rawCloses[i];
      if (typeof c === 'number' && Number.isFinite(c)) {
        closes.push(c);
        vols.push(rawVols[i] ?? 0);
      }
    }

    const price = meta.regularMarketPrice ?? (closes.at(-1) || 0);
    const prevDailyClose = closes.length >= 2 ? closes[closes.length - 2] : price;
    const fallbackPrev = meta.previousClose ?? prevDailyClose;
    const change =
      meta.fulldayChange ??
      meta.regularMarketChange ??
      (fallbackPrev > 0 ? price - fallbackPrev : 0);
    const changePercent =
      meta.regularMarketChangePercent ??
      meta.fulldayChangePercent ??
      (fallbackPrev > 0 ? (change / fallbackPrev) * 100 : 0);

    const oneMonthAgo = closes.length >= 22 ? closes[closes.length - 22] : closes[0];
    const periodReturn1M =
      oneMonthAgo && oneMonthAgo > 0
        ? Number((((price - oneMonthAgo) / oneMonthAgo) * 100).toFixed(2))
        : null;

    const recentVols = vols.slice(-20).filter((v) => v > 0);
    const avgVol =
      recentVols.length > 0 ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : null;
    const currentVol = meta.regularMarketVolume ?? (vols.at(-1) || 0);
    const volumeRatio =
      avgVol && avgVol > 0 && currentVol > 0 ? Number((currentVol / avgVol).toFixed(2)) : null;

    const quote: WatchlistQuote = {
      symbol: meta.symbol || symbol,
      name: meta.shortName || meta.longName || symbol,
      exchange: meta.exchangeName || meta.fullExchangeName || 'MKT',
      currency: meta.currency || 'USD',
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      sparkline: closes.slice(-22).map((v) => Number(v.toFixed(2))),
      fiftyTwoWeekHigh: Number((meta.fiftyTwoWeekHigh ?? price).toFixed(2)),
      fiftyTwoWeekLow: Number((meta.fiftyTwoWeekLow ?? price).toFixed(2)),
      rsi14: computeRsi14(closes),
      periodReturn1M,
      volatilityAnnualized: computeVolatility(closes),
      volumeRatio,
    };

    watchlistCache.set(symbol, {
      value: quote,
      expiresAt: Date.now() + 25_000,
    });

    return quote;
  } catch {
    return null;
  }
}

export async function fetchBatchWatchlistQuotes(symbols: string[]): Promise<WatchlistQuote[]> {
  const unique = Array.from(
    new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))
  ).slice(0, 24);
  const results = await Promise.all(unique.map((sym) => fetchWatchlistQuote(sym)));
  return results.filter((q): q is WatchlistQuote => q !== null);
}
