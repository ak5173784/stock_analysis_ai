import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Send, Trash2 } from 'lucide-react';
import type { ChatMessage, GroundingSource, StockQuoteDetail } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AnalystChatProps {
  quote: StockQuoteDetail;
}

const SUGGESTED_PROMPTS = [
  'Summarize recent earnings and forward guidance',
  'What are key technical support and resistance levels?',
  'Analyze valuation vs top sector peers',
  'List the top 3 downside risks right now',
];

export const AnalystChat: React.FC<AnalystChatProps> = ({ quote }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSymbolRef = useRef(quote.symbol);

  useEffect(() => {
    if (activeSymbolRef.current !== quote.symbol) {
      activeSymbolRef.current = quote.symbol;
      setMessages([]);
    }
  }, [quote.symbol]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const askQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || streaming) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const assistantId = `a-${Date.now() + 1}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      isStreaming: true,
    };

    const historySnapshot = messages
      .filter((m) => !m.error && m.text.trim().length > 0)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: quote.symbol,
          question: trimmed,
          history: historySnapshot,
          quoteContext: {
            symbol: quote.symbol,
            name: quote.name,
            price: quote.price,
            currency: quote.currency,
            changePercent: quote.changePercent,
            fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
            technicals: quote.technicals,
          },
        }),
      });

      if (!response.ok || !response.body) {
        const errBody = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const rawEvent of events) {
          const line = rawEvent.trim();
          if (!line.startsWith('data:')) continue;
          const payloadStr = line.slice(5).trim();
          if (!payloadStr) continue;
          const payload = JSON.parse(payloadStr) as {
            type: 'chunk' | 'sources' | 'done' | 'error';
            text?: string;
            sources?: GroundingSource[];
            error?: string;
          };

          if (payload.type === 'chunk' && payload.text) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + payload.text } : m))
            );
          } else if (payload.type === 'sources' && payload.sources) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, sources: payload.sources } : m))
            );
          } else if (payload.type === 'error') {
            throw new Error(payload.error || 'Streaming error');
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unable to reach AI analyst.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, isStreaming: false, error: errMsg } : m
        )
      );
    } finally {
      setStreaming(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askQuestion(input);
  };

  return (
    <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col h-[540px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            AI Research Analyst
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Grounded in {quote.symbol} live metrics & web search
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ask a specific question about {quote.name} ({quote.symbol}) or select a research prompt:
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => askQuestion(prompt)}
                  className="text-left px-3 py-2.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-slate-900/70 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={
                msg.role === 'user'
                  ? 'ml-8 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100'
                  : 'space-y-2'
              }
            >
              {msg.role === 'user' ? (
                <p className="text-[13px] leading-relaxed">{msg.text}</p>
              ) : (
                <div className="pb-3 border-b border-slate-100 dark:border-slate-800/70 last:border-b-0">
                  {msg.error ? (
                    <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
                      {msg.error}
                    </div>
                  ) : msg.text ? (
                    <MarkdownRenderer content={msg.text} />
                  ) : (
                    <span className="text-xs font-mono text-slate-500">Analyzing {quote.symbol}...</span>
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {msg.sources.slice(0, 4).map((src, i) => (
                        <a
                          key={i}
                          href={src.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <span className="truncate max-w-[160px]">{src.title}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          placeholder={`Ask about ${quote.symbol} earnings, valuation, risks...`}
          className="flex-1 min-w-0 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          aria-label="Send question"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </section>
  );
};
