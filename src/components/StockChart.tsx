import React, { useMemo, useState } from 'react';
import type { CandlePoint, TimeRange } from '../types';

interface MiniSparklineProps {
  values: number[];
  positive: boolean;
  width?: number;
  height?: number;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  values,
  positive,
  width = 56,
  height = 20,
}) => {
  const pathData = useMemo(() => {
    if (!values || values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = width / (values.length - 1);
    return values
      .map((val, idx) => {
        const x = (idx * stepX).toFixed(1);
        const y = (height - 2 - ((val - min) / span) * (height - 4)).toFixed(1);
        return `${idx === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
  }, [values, width, height]);

  if (!pathData) {
    return <div style={{ width, height }} className="opacity-30" />;
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <path
        d={pathData}
        fill="none"
        stroke={positive ? '#10B981' : '#F43F5E'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface StockChartProps {
  symbol: string;
  currency: string;
  candles: CandlePoint[];
  previousClose: number;
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  loading?: boolean;
}

const RANGES: Array<{ value: TimeRange; label: string }> = [
  { value: '5d', label: '5D' },
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
];

function formatCompactVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return String(vol);
}

export const StockChart: React.FC<StockChartProps> = ({
  symbol,
  currency,
  candles,
  previousClose,
  range,
  onRangeChange,
  loading = false,
}) => {
  const [chartMode, setChartMode] = useState<'area' | 'candles'>('area');
  const [showSma20, setShowSma20] = useState(true);
  const [showSma50, setShowSma50] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const SVG_W = 880;
  const SVG_H = 340;
  const PAD_LEFT = 12;
  const PAD_RIGHT = 66;
  const PAD_TOP = 16;
  const PRICE_H = 228;
  const VOL_TOP = 260;
  const VOL_H = 54;
  const CHART_W = SVG_W - PAD_LEFT - PAD_RIGHT;

  const { minPrice, maxPrice, maxVol, priceTicks } = useMemo(() => {
    if (candles.length === 0) {
      return { minPrice: 0, maxPrice: 100, maxVol: 1, priceTicks: [0, 50, 100] };
    }
    let lo = Infinity;
    let hi = -Infinity;
    let mVol = 1;
    for (const c of candles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
      if (showSma20 && c.sma20 !== null) {
        if (c.sma20 < lo) lo = c.sma20;
        if (c.sma20 > hi) hi = c.sma20;
      }
      if (showSma50 && c.sma50 !== null) {
        if (c.sma50 < lo) lo = c.sma50;
        if (c.sma50 > hi) hi = c.sma50;
      }
      if (c.volume > mVol) mVol = c.volume;
    }
    const pad = (hi - lo) * 0.08 || hi * 0.02 || 1;
    const minP = lo - pad;
    const maxP = hi + pad;
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) {
      ticks.push(minP + ((maxP - minP) * i) / 4);
    }
    return { minPrice: minP, maxPrice: maxP, maxVol: mVol, priceTicks: ticks };
  }, [candles, showSma20, showSma50]);

  const xFor = (idx: number) => {
    if (candles.length <= 1) return PAD_LEFT + CHART_W / 2;
    return PAD_LEFT + (idx / (candles.length - 1)) * CHART_W;
  };

  const yForPrice = (price: number) => {
    const span = maxPrice - minPrice || 1;
    return PAD_TOP + PRICE_H - ((price - minPrice) / span) * PRICE_H;
  };

  const firstClose = candles[0]?.close ?? previousClose;
  const lastClose = candles[candles.length - 1]?.close ?? previousClose;
  const isPeriodPositive = lastClose >= firstClose;
  const strokeColor = isPeriodPositive ? '#10B981' : '#F43F5E';

  const areaPaths = useMemo(() => {
    if (candles.length < 2) return { line: '', area: '' };
    const points = candles.map((c, idx) => `${xFor(idx).toFixed(1)},${yForPrice(c.close).toFixed(1)}`);
    const line = `M${points.join(' L')}`;
    const lastX = xFor(candles.length - 1).toFixed(1);
    const firstX = xFor(0).toFixed(1);
    const bottomY = (PAD_TOP + PRICE_H).toFixed(1);
    const area = `${line} L${lastX},${bottomY} L${firstX},${bottomY} Z`;
    return { line, area };
  }, [candles, minPrice, maxPrice]);

  const buildOverlayPath = (key: 'sma20' | 'sma50') => {
    let path = '';
    let started = false;
    candles.forEach((c, idx) => {
      const val = c[key];
      if (val === null) {
        started = false;
        return;
      }
      const x = xFor(idx).toFixed(1);
      const y = yForPrice(val).toFixed(1);
      path += `${started ? ' L' : ' M'}${x},${y}`;
      started = true;
    });
    return path.trim();
  };

  const sma20Path = useMemo(() => (showSma20 ? buildOverlayPath('sma20') : ''), [
    candles,
    showSma20,
    minPrice,
    maxPrice,
  ]);
  const sma50Path = useMemo(() => (showSma50 ? buildOverlayPath('sma50') : ''), [
    candles,
    showSma50,
    minPrice,
    maxPrice,
  ]);

  const activePoint =
    hoverIdx !== null && candles[hoverIdx]
      ? candles[hoverIdx]
      : candles.length > 0
      ? candles[candles.length - 1]
      : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (candles.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const clamped = Math.max(PAD_LEFT, Math.min(PAD_LEFT + CHART_W, relX));
    const ratio = (clamped - PAD_LEFT) / CHART_W;
    const idx = Math.round(ratio * (candles.length - 1));
    setHoverIdx(Math.max(0, Math.min(candles.length - 1, idx)));
  };

  const candleWidth = Math.max(2, Math.min(10, CHART_W / Math.max(1, candles.length) - 2));
  const xTickIndices = useMemo(() => {
    if (candles.length <= 2) return [];
    const count = 5;
    const indices: number[] = [];
    for (let i = 0; i < count; i++) {
      indices.push(Math.round((i / (count - 1)) * (candles.length - 1)));
    }
    return Array.from(new Set(indices));
  }, [candles.length]);

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => onRangeChange(r.value)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                range === r.value
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
            <button
              type="button"
              onClick={() => setChartMode('area')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'area'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Area
            </button>
            <button
              type="button"
              onClick={() => setChartMode('candles')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'candles'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Candles
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowSma20((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-mono rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              showSma20
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            SMA 20
          </button>
          <button
            type="button"
            onClick={() => setShowSma50((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-mono rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              showSma50
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            SMA 50
          </button>
        </div>
      </div>

      {/* Live OHLC Crosshair Readout Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2 bg-slate-50/60 dark:bg-slate-900/40 border-b border-slate-200/70 dark:border-slate-800/70 text-xs font-mono">
        {activePoint ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-400">
            <span className="text-slate-900 dark:text-slate-200 font-medium">
              {activePoint.dateLabel}
            </span>
            <span>
              O <span className="text-slate-900 dark:text-slate-100">{activePoint.open.toFixed(2)}</span>
            </span>
            <span>
              H <span className="text-slate-900 dark:text-slate-100">{activePoint.high.toFixed(2)}</span>
            </span>
            <span>
              L <span className="text-slate-900 dark:text-slate-100">{activePoint.low.toFixed(2)}</span>
            </span>
            <span>
              C <span className="text-slate-900 dark:text-slate-100">{activePoint.close.toFixed(2)}</span>
            </span>
            <span>
              Vol{' '}
              <span className="text-slate-900 dark:text-slate-100">
                {formatCompactVolume(activePoint.volume)}
              </span>
            </span>
          </div>
        ) : (
          <span className="text-slate-500">Hover chart to inspect OHLCV bars</span>
        )}
        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          {showSma20 && activePoint?.sma20 !== null && activePoint?.sma20 !== undefined && (
            <span className="text-blue-600 dark:text-blue-400">
              SMA20 {activePoint.sma20.toFixed(2)}
            </span>
          )}
          {showSma50 && activePoint?.sma50 !== null && activePoint?.sma50 !== undefined && (
            <span className="text-amber-600 dark:text-amber-400">
              SMA50 {activePoint.sma50.toFixed(2)}
            </span>
          )}
          <span>{currency}</span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative px-2 py-2">
        {loading && (
          <div className="absolute inset-0 z-10 bg-white/60 dark:bg-[#111827]/60 backdrop-blur-[1px] flex items-center justify-center">
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
              Loading {symbol} series...
            </span>
          </div>
        )}

        {candles.length === 0 ? (
          <div className="h-[340px] flex items-center justify-center text-sm text-slate-500">
            No historical price bars available for {symbol}.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full h-auto select-none cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              <linearGradient id={`areaGrad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.24" />
                <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Horizontal price gridlines */}
            {priceTicks.map((tick, idx) => {
              const y = yForPrice(tick);
              return (
                <g key={idx}>
                  <line
                    x1={PAD_LEFT}
                    y1={y}
                    x2={PAD_LEFT + CHART_W}
                    y2={y}
                    className="stroke-slate-200 dark:stroke-slate-800"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={PAD_LEFT + CHART_W + 8}
                    y={y + 4}
                    className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                  >
                    {tick.toFixed(tick >= 100 ? 1 : 2)}
                  </text>
                </g>
              );
            })}

            {/* Area or Candlesticks */}
            {chartMode === 'area' ? (
              <g>
                <path d={areaPaths.area} fill={`url(#areaGrad-${symbol})`} />
                <path
                  d={areaPaths.line}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </g>
            ) : (
              <g>
                {candles.map((c, idx) => {
                  const x = xFor(idx);
                  const yOpen = yForPrice(c.open);
                  const yClose = yForPrice(c.close);
                  const yHigh = yForPrice(c.high);
                  const yLow = yForPrice(c.low);
                  const isUp = c.close >= c.open;
                  const color = isUp ? '#10B981' : '#F43F5E';
                  const bodyTop = Math.min(yOpen, yClose);
                  const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
                  return (
                    <g key={c.time}>
                      <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.2" />
                      <rect
                        x={x - candleWidth / 2}
                        y={bodyTop}
                        width={candleWidth}
                        height={bodyH}
                        fill={color}
                        rx="1"
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* Moving Average Overlays */}
            {showSma20 && sma20Path && (
              <path
                d={sma20Path}
                fill="none"
                stroke="#3B82F6"
                strokeWidth="1.5"
                strokeLinejoin="round"
                opacity="0.9"
              />
            )}
            {showSma50 && sma50Path && (
              <path
                d={sma50Path}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.5"
                strokeLinejoin="round"
                opacity="0.9"
              />
            )}

            {/* Volume Histogram */}
            <g>
              <line
                x1={PAD_LEFT}
                y1={VOL_TOP - 4}
                x2={PAD_LEFT + CHART_W}
                y2={VOL_TOP - 4}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1"
              />
              {candles.map((c, idx) => {
                const x = xFor(idx);
                const h = Math.max(1, (c.volume / maxVol) * VOL_H);
                const isUp = c.close >= c.open;
                return (
                  <rect
                    key={`vol-${c.time}`}
                    x={x - Math.max(1, candleWidth / 2)}
                    y={VOL_TOP + VOL_H - h}
                    width={Math.max(1.5, candleWidth)}
                    height={h}
                    fill={isUp ? '#10B981' : '#F43F5E'}
                    opacity={hoverIdx === idx ? 0.85 : 0.35}
                  />
                );
              })}
            </g>

            {/* X-Axis Labels */}
            {xTickIndices.map((idx) => {
              const c = candles[idx];
              if (!c) return null;
              return (
                <text
                  key={`x-${idx}`}
                  x={xFor(idx)}
                  y={SVG_H - 6}
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                >
                  {c.dateLabel}
                </text>
              );
            })}

            {/* Interactive Crosshair */}
            {hoverIdx !== null && candles[hoverIdx] && (
              <g>
                <line
                  x1={xFor(hoverIdx)}
                  y1={PAD_TOP}
                  x2={xFor(hoverIdx)}
                  y2={VOL_TOP + VOL_H}
                  className="stroke-slate-400 dark:stroke-slate-500"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <line
                  x1={PAD_LEFT}
                  y1={yForPrice(candles[hoverIdx].close)}
                  x2={PAD_LEFT + CHART_W}
                  y2={yForPrice(candles[hoverIdx].close)}
                  className="stroke-slate-400 dark:stroke-slate-500"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={xFor(hoverIdx)}
                  cy={yForPrice(candles[hoverIdx].close)}
                  r="4"
                  fill={strokeColor}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
};
