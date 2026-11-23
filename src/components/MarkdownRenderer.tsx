import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="px-1 py-0.5 text-[12px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];

  const flushLists = (keyPrefix: string) => {
    if (listItems.length > 0) {
      blocks.push(
        <ul
          key={`${keyPrefix}-ul`}
          className="space-y-1.5 my-2.5 pl-4 list-disc marker:text-slate-400 dark:marker:text-slate-600"
        >
          {listItems.map((item, i) => (
            <li key={i} className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
    if (orderedItems.length > 0) {
      blocks.push(
        <ol
          key={`${keyPrefix}-ol`}
          className="space-y-1.5 my-2.5 pl-5 list-decimal marker:text-slate-500 dark:marker:text-slate-400 marker:font-mono marker:text-xs"
        >
          {orderedItems.map((item, i) => (
            <li key={i} className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      orderedItems = [];
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushLists(`line-${index}`);
      return;
    }

    if (line.startsWith('### ')) {
      flushLists(`h3-${index}`);
      blocks.push(
        <h4
          key={`h3-${index}`}
          className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-4 mb-1.5"
        >
          {renderInline(line.slice(4))}
        </h4>
      );
      return;
    }

    if (line.startsWith('## ')) {
      flushLists(`h2-${index}`);
      blocks.push(
        <h3
          key={`h2-${index}`}
          className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 mt-5 mb-2 pt-4 border-t border-slate-200 dark:border-slate-800 first:mt-0 first:pt-0 first:border-t-0"
        >
          {renderInline(line.slice(3))}
        </h3>
      );
      return;
    }

    if (line.startsWith('# ')) {
      flushLists(`h1-${index}`);
      blocks.push(
        <h2
          key={`h1-${index}`}
          className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-4 mb-2"
        >
          {renderInline(line.slice(2))}
        </h2>
      );
      return;
    }

    if (/^[-*•]\s+/.test(line)) {
      if (orderedItems.length > 0) flushLists(`switch-${index}`);
      listItems.push(line.replace(/^[-*•]\s+/, ''));
      return;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (listItems.length > 0) flushLists(`switch-ol-${index}`);
      orderedItems.push(line.replace(/^\d+\.\s+/, ''));
      return;
    }

    flushLists(`p-${index}`);
    blocks.push(
      <p
        key={`p-${index}`}
        className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300 my-2"
      >
        {renderInline(line)}
      </p>
    );
  });

  flushLists('end');
  return <div>{blocks}</div>;
};
