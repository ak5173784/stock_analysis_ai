import React, { useState } from 'react';
import { ExternalLink, FileText, Newspaper, RefreshCw } from 'lucide-react';
import type { AiResearchBrief, NewsItem } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AiResearchPanelProps {
  symbol: string;
  brief: AiResearchBrief | null;
  loading: boolean;
  error: string | null;
  onGenerateBrief: () => void;
  news: NewsItem[];
}

function formatRelativeTime(unixSec: number): string {
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export const AiResearchPanel: React.FC<AiResearchPanelProps> = ({
  symbol,
  brief,
  loading,
  error,
  onGenerateBrief,
  news,
}) => {
  const [activeTab, setActiveTab] = useState<'brief' | 'news'>('brief');

  return (
    <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col">
      {/* Header Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('brief')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'brief'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>AI Research Brief</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('news')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'news'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span>Market News ({news.length})</span>
          </button>
        </div>

        {activeTab === 'brief' && (
          <button
            type="button"
            onClick={onGenerateBrief}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{brief ? 'Refresh Brief' : 'Generate Brief'}</span>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex-1">
        {activeTab === 'brief' ? (
          <>
            {error && (
              <div className="p-3.5 mb-4 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            {loading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="space-y-2">
                  <div className="h-3.5 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3.5 w-11/12 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3.5 w-4/5 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded mt-6" />
                <div className="space-y-2">
                  <div className="h-3.5 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3.5 w-5/6 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
              </div>
            ) : brief && brief.symbol === symbol ? (
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-4 font-mono">
                  <span>{brief.symbol}</span>
                  <span aria-hidden="true">·</span>
                  <span>Search-grounded synthesis</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {new Date(brief.generatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <MarkdownRenderer content={brief.markdown} />

                {brief.sources.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
                      Verified Web Sources
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {brief.sources.map((src, idx) => (
                        <a
                          key={idx}
                          href={src.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <span className="truncate">{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-10 text-center max-w-md mx-auto">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Institutional Research Brief for {symbol}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Synthesize current earnings, bull/bear catalysts, valuation context, and technical posture using live search grounding.
                </p>
                <button
                  type="button"
                  onClick={onGenerateBrief}
                  className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  Generate Research Brief
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {news.length === 0 ? (
              <div className="py-8 text-sm text-slate-500 dark:text-slate-400 text-center">
                No recent headlines returned for {symbol}.
              </div>
            ) : (
              news.map((item) => (
                <a
                  key={item.id}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block py-3.5 first:pt-0 last:pb-0 group"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span>{item.publisher}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{formatRelativeTime(item.publishedAt)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                      {item.title}
                    </h4>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5 opacity-60 group-hover:opacity-100" />
                  </div>
                </a>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
};
