import { GoogleGenAI, Type } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import type { GroundingSource, StockQuoteDetail } from '../src/types.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your key in the Settings > Secrets panel to enable AI market research.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractGroundingSources(response: GenerateContentResponse): GroundingSource[] {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const sources: GroundingSource[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({
        uri,
        title: title || new URL(uri).hostname.replace(/^www\./, ''),
      });
    }
  }
  return sources.slice(0, 8);
}

export function formatApiError(err: unknown): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  if (rawMessage.includes('GEMINI_API_KEY is not configured')) {
    return { status: 400, message: rawMessage };
  }
  if (rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message:
        'Gemini API access was denied. Verify your GEMINI_API_KEY in the Settings > Secrets panel.',
    };
  }
  if (rawMessage.includes('RESOURCE_EXHAUSTED') || rawMessage.includes('429')) {
    return {
      status: 429,
      message:
        'Gemini API quota limit reached. Please wait briefly or verify billing tier in Settings > Secrets.',
    };
  }
  return { status: 500, message: rawMessage || 'Failed to generate AI analysis.' };
}

export async function generateEquityResearchBrief(quote: StockQuoteDetail): Promise<{
  markdown: string;
  sources: GroundingSource[];
}> {
  const ai = getAiClient();
  const prompt = `Prepare an institutional equity research brief for ${quote.name} (${quote.symbol}) traded on ${quote.exchange}.

Live market snapshot as of today:
- Current Price: ${quote.price} ${quote.currency} (${quote.change >= 0 ? '+' : ''}${quote.change}, ${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent}% today)
- 52-Week Range: ${quote.fiftyTwoWeekLow} to ${quote.fiftyTwoWeekHigh}
- RSI (14): ${quote.technicals.rsi14 ?? 'N/A'}
- SMA 20 / SMA 50: ${quote.technicals.sma20 ?? 'N/A'} / ${quote.technicals.sma50 ?? 'N/A'}
- Annualized Volatility: ${quote.technicals.volatilityAnnualized !== null ? `${quote.technicals.volatilityAnnualized}%` : 'N/A'}
- Volume vs 20D Avg: ${quote.technicals.volumeRatio !== null ? `${quote.technicals.volumeRatio}x` : 'N/A'}

Use Google Search to incorporate the latest earnings report, analyst consensus, recent company catalysts, and macro context.
Format the response cleanly with these exact level-2 headings:
## Executive Thesis
## Bull Case Catalysts
## Bear Case & Key Risks
## Valuation & Earnings Context
## Technical Posture

Keep each section concise, specific, factual, and analytical. Avoid hype, promotional language, or fabricated price targets unless citing reported analyst consensus.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are a senior buy-side equity research analyst. Deliver rigorous, neutral, evidence-backed financial briefs grounded in current web search data and live technical metrics. Include a brief one-line informational disclaimer at the very end stating this is market research, not personalized financial advice.',
      tools: [{ googleSearch: {} }],
    },
  });

  const markdown = response.text?.trim();
  if (!markdown) {
    throw new Error('Empty response received from Gemini research model.');
  }

  return {
    markdown,
    sources: extractGroundingSources(response),
  };
}

export async function streamAnalystAnswer(params: {
  symbol: string;
  question: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  quoteContext?: Partial<StockQuoteDetail>;
  onChunk: (text: string) => void;
}): Promise<{ sources: GroundingSource[] }> {
  const ai = getAiClient();

  const ctx = params.quoteContext;
  const contextLine = ctx
    ? `Active ticker context: ${ctx.name || params.symbol} (${params.symbol}), Price: ${ctx.price ?? 'N/A'} ${ctx.currency ?? 'USD'}, Day Change: ${ctx.changePercent ?? 'N/A'}%, 52W Range: ${ctx.fiftyTwoWeekLow ?? 'N/A'} - ${ctx.fiftyTwoWeekHigh ?? 'N/A'}, RSI(14): ${ctx.technicals?.rsi14 ?? 'N/A'}, SMA20: ${ctx.technicals?.sma20 ?? 'N/A'}, SMA50: ${ctx.technicals?.sma50 ?? 'N/A'}.`
    : `Active ticker: ${params.symbol}.`;

  const contents = [
    ...params.history.slice(-8).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    })),
    {
      role: 'user',
      parts: [{ text: params.question }],
    },
  ];

  const stream = await ai.models.generateContentStream({
    model: 'gemini-4-hydrogen',
    contents,
    config: {
      systemInstruction: `You are Kestrel Equity's institutional research analyst. ${contextLine} Use Google Search for latest filings, earnings, news, and peer comparisons. Respond concisely in well-structured Markdown with concrete numbers and clear reasoning. Never fabricate prices or metrics.`,
      tools: [{ googleSearch: {} }],
    },
  });

  const seenUris = new Set<string>();
  const sources: GroundingSource[] = [];

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) {
      params.onChunk(text);
    }
    const chunkSources = extractGroundingSources(chunk);
    for (const s of chunkSources) {
      if (!seenUris.has(s.uri)) {
        seenUris.add(s.uri);
        sources.push(s);
      }
    }
  }

  return { sources: sources.slice(0, 8) };
}

export async function runAiStockScreener(query: string): Promise<{
  summary: string;
  candidates: Array<{
    symbol: string;
    thesis: string;
    catalyst: string;
    risk: string;
  }>;
  sources: GroundingSource[];
}> {
  const ai = getAiClient();

  // Pass 1: Grounded search discovery for up-to-date equities matching the user's thesis
  const groundedResp = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Identify 5 to 6 real, actively traded public companies (primarily US-listed tickers like NYSE/NASDAQ) that best match this equity screening thesis: "${query}".

For each company, verify its ticker symbol, explain why it matches the thesis with concrete business fundamentals, highlight a near-term catalyst, and note the primary risk.`,
    config: {
      systemInstruction:
        'You are an institutional equity strategist screening public markets. Return factual, current companies with verified ticker symbols.',
      tools: [{ googleSearch: {} }],
    },
  });

  const groundedText = groundedResp.text?.trim() || '';
  const sources = extractGroundingSources(groundedResp);

  // Pass 2: Extract strictly typed structured candidates from the grounded analysis
  const structuredResp = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Extract the screening summary and the exact stock candidates from this research note into structured JSON.\n\nResearch Note:\n${groundedText}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: '2-3 sentence executive synthesis of the screen.',
          },
          candidates: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                symbol: {
                  type: Type.STRING,
                  description: 'Uppercase stock ticker symbol only, e.g. NVDA, MSFT, LLY.',
                },
                thesis: {
                  type: Type.STRING,
                  description: 'Concise 1-2 sentence fundamental match rationale.',
                },
                catalyst: {
                  type: Type.STRING,
                  description: 'Primary upcoming growth or valuation catalyst.',
                },
                risk: {
                  type: Type.STRING,
                  description: 'Primary downside risk.',
                },
              },
              required: ['symbol', 'thesis', 'catalyst', 'risk'],
            },
          },
        },
        required: ['summary', 'candidates'],
      },
    },
  });

  const parsed = JSON.parse((structuredResp.text ?? '{}').trim()) as {
    summary?: string;
    candidates?: Array<{
      symbol: string;
      thesis: string;
      catalyst: string;
      risk: string;
    }>;
  };

  return {
    summary: parsed.summary || 'Grounded market screen completed.',
    candidates: (parsed.candidates ?? [])
      .map((c) => ({
        symbol: c.symbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, ''),
        thesis: c.thesis,
        catalyst: c.catalyst,
        risk: c.risk,
      }))
      .filter((c) => c.symbol.length > 0)
      .slice(0, 6),
    sources,
  };
}

export async function generatePeerComparisonMemo(params: {
  peers: Array<{
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    periodReturn1M: number | null;
    rsi14: number | null;
    volatilityAnnualized: number | null;
  }>;
}): Promise<{ markdown: string; sources: GroundingSource[] }> {
  const ai = getAiClient();
  const tableText = params.peers
    .map(
      (p) =>
        `- ${p.symbol} (${p.name}): Price $${p.price}, Today ${p.changePercent}%, 1M Return ${
          p.periodReturn1M ?? 'N/A'
        }%, RSI(14) ${p.rsi14 ?? 'N/A'}, Ann. Vol ${p.volatilityAnnualized ?? 'N/A'}%`
    )
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Compare these equities side-by-side using current fundamentals, valuation multiples, growth drivers, and the live metrics below:\n\n${tableText}\n\nProvide sections:\n## Comparative Positioning\n## Relative Valuation & Growth\n## Momentum & Risk Trade-offs\n## Key Differentiation`,
    config: {
      systemInstruction:
        'You are a senior equity research director writing a concise institutional peer comparison memo grounded in search data.',
      tools: [{ googleSearch: {} }],
    },
  });

  return {
    markdown: response.text?.trim() || '',
    sources: extractGroundingSources(response),
  };
}

export async function generatePortfolioAudit(params: {
  holdings: Array<{
    symbol: string;
    name: string;
    shares: number;
    avgCost: number;
    currentPrice: number;
    marketValue: number;
    weightPercent: number;
    unrealizedPnlPercent: number;
  }>;
  totalValue: number;
  totalPnlPercent: number;
}): Promise<{ markdown: string; sources: GroundingSource[] }> {
  const ai = getAiClient();
  const breakdown = params.holdings
    .map(
      (h) =>
        `- ${h.symbol} (${h.name}): ${h.shares} sh @ $${h.avgCost.toFixed(2)} avg, Current $${h.currentPrice.toFixed(
          2
        )}, Value $${h.marketValue.toFixed(2)} (${h.weightPercent.toFixed(
          1
        )}% weight), P&L ${h.unrealizedPnlPercent >= 0 ? '+' : ''}${h.unrealizedPnlPercent.toFixed(2)}%`
    )
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Audit this equity portfolio (Total Value: $${params.totalValue.toFixed(
      2
    )}, Total Return: ${params.totalPnlPercent >= 0 ? '+' : ''}${params.totalPnlPercent.toFixed(2)}%):

${breakdown}

Evaluate sector/single-name concentration, macro factor exposure (rate sensitivity, cyclicality, AI/tech beta), recent catalysts affecting top positions, and practical risk-management considerations. Use clean level-2 headings:
## Concentration & Factor Exposure
## Catalyst & Earnings Watchlist
## Risk Mitigation Considerations`,
    config: {
      systemInstruction:
        'You are an institutional portfolio risk strategist. Provide objective, quantitative portfolio risk analysis grounded in current market developments. End with a one-line disclaimer that this is educational risk analysis, not personalized investment advice.',
      tools: [{ googleSearch: {} }],
    },
  });

  return {
    markdown: response.text?.trim() || '',
    sources: extractGroundingSources(response),
  };
}
