export type TimeRange = '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y';

export interface CandlePoint {
  time: number; // unix seconds
  dateLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20: number | null;
  sma50: number | null;
}

export interface TechnicalIndicators {
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  macd: number | null;
  macdSignal: number | null;
  avgVolume20: number | null;
  volumeRatio: number | null;
  volatilityAnnualized: number | null;
  periodReturnPercent: number | null;
}

export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: number;
}

export interface StockQuoteDetail {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  instrumentType: string;
  marketState: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  volume: number;
  range: TimeRange;
  candles: CandlePoint[];
  technicals: TechnicalIndicators;
  news: NewsItem[];
}

export interface WatchlistQuote {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  sparkline: number[];
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  rsi14: number | null;
  periodReturn1M: number | null;
  volatilityAnnualized: number | null;
  volumeRatio: number | null;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  sector?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AiResearchBrief {
  symbol: string;
  generatedAt: string;
  markdown: string;
  sources: GroundingSource[];
}

export interface ScreenerMatch {
  symbol: string;
  thesis: string;
  catalyst: string;
  risk: string;
  quote: WatchlistQuote | null;
}

export interface ScreenerResponse {
  query: string;
  summary: string;
  matches: ScreenerMatch[];
  sources: GroundingSource[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: GroundingSource[];
  isStreaming?: boolean;
  error?: string;
}

export interface PortfolioPosition {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
}
