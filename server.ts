import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  fetchBatchWatchlistQuotes,
  fetchStockQuoteDetail,
  searchTickers,
} from './server/market.ts';
import {
  formatApiError,
  generateEquityResearchBrief,
  generatePeerComparisonMemo,
  generatePortfolioAudit,
  runAiStockScreener,
  streamAnalystAnswer,
} from './server/ai.ts';
import type { StockQuoteDetail, TimeRange } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'kestrel-equity' });
});

// Market search autocomplete
app.get('/api/market/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const results = await searchTickers(q);
    res.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    res.status(502).json({ error: message });
  }
});

// Single ticker full quote, OHLCV, technicals & news
app.get('/api/market/quote/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol;
    const range = (typeof req.query.range === 'string' ? req.query.range : '3mo') as TimeRange;
    const quote = await fetchStockQuoteDetail(symbol, range);
    res.json(quote);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch quote';
    res.status(502).json({ error: message });
  }
});

// Batch watchlist & benchmark quotes
app.post('/api/market/quotes', async (req, res) => {
  try {
    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
    const quotes = await fetchBatchWatchlistQuotes(symbols);
    res.json({ quotes });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch batch quotes';
    res.status(502).json({ error: message });
  }
});

// AI Institutional Research Brief (Search Grounded)
app.post('/api/ai/research', async (req, res) => {
  try {
    const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.trim().toUpperCase() : '';
    if (!symbol) {
      res.status(400).json({ error: 'Symbol is required' });
      return;
    }
    const quote: StockQuoteDetail =
      req.body?.quote && req.body.quote.symbol === symbol
        ? req.body.quote
        : await fetchStockQuoteDetail(symbol, '3mo');

    const brief = await generateEquityResearchBrief(quote);
    res.json({
      symbol,
      generatedAt: new Date().toISOString(),
      markdown: brief.markdown,
      sources: brief.sources,
    });
  } catch (err) {
    const { status, message } = formatApiError(err);
    res.status(status).json({ error: message });
  }
});

// Streaming AI Analyst Q&A (SSE + Search Grounded)
app.post('/api/ai/ask', async (req, res) => {
  const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.trim().toUpperCase() : '';
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  const quoteContext = req.body?.quoteContext;

  if (!symbol || !question) {
    res.status(400).json({ error: 'Symbol and question are required.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const { sources } = await streamAnalystAnswer({
      symbol,
      question,
      history,
      quoteContext,
      onChunk: (text) => {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
      },
    });
    res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    const { message } = formatApiError(err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
    res.end();
  }
});

// Natural-language AI Stock Screener enriched with live Yahoo Finance metrics
app.post('/api/ai/screener', async (req, res) => {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!query) {
      res.status(400).json({ error: 'Screening thesis prompt is required.' });
      return;
    }

    const aiScreen = await runAiStockScreener(query);
    const symbols = aiScreen.candidates.map((c) => c.symbol);
    const liveQuotes = symbols.length > 0 ? await fetchBatchWatchlistQuotes(symbols) : [];
    const quoteMap = new Map(liveQuotes.map((q) => [q.symbol.toUpperCase(), q]));

    const matches = aiScreen.candidates.map((c) => ({
      ...c,
      quote: quoteMap.get(c.symbol.toUpperCase()) ?? null,
    }));

    res.json({
      query,
      summary: aiScreen.summary,
      matches,
      sources: aiScreen.sources,
    });
  } catch (err) {
    const { status, message } = formatApiError(err);
    res.status(status).json({ error: message });
  }
});

// AI Peer Comparison Memo
app.post('/api/ai/compare', async (req, res) => {
  try {
    const peers = Array.isArray(req.body?.peers) ? req.body.peers : [];
    if (peers.length < 2) {
      res.status(400).json({ error: 'Select at least 2 tickers to compare.' });
      return;
    }
    const result = await generatePeerComparisonMemo({ peers });
    res.json({
      generatedAt: new Date().toISOString(),
      markdown: result.markdown,
      sources: result.sources,
    });
  } catch (err) {
    const { status, message } = formatApiError(err);
    res.status(status).json({ error: message });
  }
});

// AI Portfolio Risk Audit
app.post('/api/ai/portfolio-audit', async (req, res) => {
  try {
    const holdings = Array.isArray(req.body?.holdings) ? req.body.holdings : [];
    const totalValue = Number(req.body?.totalValue) || 0;
    const totalPnlPercent = Number(req.body?.totalPnlPercent) || 0;
    if (holdings.length === 0) {
      res.status(400).json({ error: 'Add at least one position to run a portfolio audit.' });
      return;
    }
    const result = await generatePortfolioAudit({ holdings, totalValue, totalPnlPercent });
    res.json({
      generatedAt: new Date().toISOString(),
      markdown: result.markdown,
      sources: result.sources,
    });
  } catch (err) {
    const { status, message } = formatApiError(err);
    res.status(status).json({ error: message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kestrel Equity server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
