"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/types";
import { pricePrecision } from "@/lib/format";

// paper-terminal palette: deep up/down inks that hold on the bone surface
const UP = "#0a8f55";
const DOWN = "#cf3b31";

const TIMEFRAMES = [
  { label: "5s", tf: "second", agg: 5, secs: 5 },
  { label: "1m", tf: "minute", agg: 1, secs: 60 },
  { label: "5m", tf: "minute", agg: 5, secs: 300 },
  { label: "15m", tf: "minute", agg: 15, secs: 900 },
  { label: "1h", tf: "hour", agg: 1, secs: 3600 },
  { label: "4h", tf: "hour", agg: 4, secs: 14400 },
  { label: "1D", tf: "day", agg: 1, secs: 86400 },
] as const;
const TF_1H = 4; // fallback index when a pool has no fine-grained history

type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number };

export default function CandleChart({
  pairAddress,
  livePriceUsd,
  avgEntryUsd,
}: {
  pairAddress: string;
  livePriceUsd?: number;
  /** draws the "your entry" line, the way every trading app shows it */
  avgEntryUsd?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastBarRef = useRef<Bar | null>(null);
  const entryLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);
  const fellBackRef = useRef<Set<string>>(new Set());
  const [tfIdx, setTfIdx] = useState(0); // 5s default — this is a trading app
  const [empty, setEmpty] = useState(false);

  // build the chart + load candles on pool / timeframe change
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !pairAddress) return;
    let disposed = false;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8d8778",
        fontFamily: "var(--font-jbmono), monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(19,17,16,0.06)" },
        horzLines: { color: "rgba(19,17,16,0.06)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,82,0,0.45)", labelBackgroundColor: "#131110" },
        horzLine: { color: "rgba(255,82,0,0.45)", labelBackgroundColor: "#131110" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: "rgba(10,143,85,0.75)",
      wickDownColor: "rgba(207,59,49,0.75)",
    });
    seriesRef.current = series;

    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volRef.current = vol;

    const { tf, agg } = TIMEFRAMES[tfIdx];
    let loadedOnce = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/ohlcv?pool=${pairAddress}&tf=${tf}&agg=${agg}`);
        const data: { candles: Candle[] } = await res.json();
        if (disposed || !data.candles) return;
        if (data.candles.length === 0) {
          // only declare empty if we never had data — a flaky refresh keeps the chart
          if (!loadedOnce) {
            // this pool may simply have no fine-grained history: fall back once to 1h
            if (tf === "minute" && !fellBackRef.current.has(pairAddress)) {
              fellBackRef.current.add(pairAddress);
              setTfIdx(TF_1H);
            } else {
              setEmpty(true);
            }
          }
          return;
        }
        loadedOnce = true;
        setEmpty(false);

        const px = data.candles[data.candles.length - 1].close;
        series.applyOptions({ priceFormat: { type: "price", ...pricePrecision(px) } });

        series.setData(
          data.candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        vol.setData(
          data.candles.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? "rgba(10,143,85,0.3)" : "rgba(207,59,49,0.3)",
          })),
        );
        const last = data.candles[data.candles.length - 1];
        const server: Bar = {
          time: last.time as UTCTimestamp,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
        };
        // never rewind the live candle: if the bar we built from ticks is the
        // same bucket or newer, it stays — a resync that steps back makes the
        // chart replay the same seconds in a loop
        const prev = lastBarRef.current;
        if (prev && prev.time >= server.time) {
          const keep: Bar =
            prev.time === server.time
              ? {
                  time: server.time,
                  open: server.open,
                  high: Math.max(server.high, prev.high),
                  low: Math.min(server.low, prev.low),
                  close: prev.close,
                }
              : prev;
          try {
            series.update(keep);
          } catch {
            /* series busy — next tick repaints anyway */
          }
          lastBarRef.current = keep;
        } else {
          lastBarRef.current = server;
        }
      } catch {
        if (!disposed) setEmpty(true);
      }
    };

    load();
    // resync from the store (database-only reads): 10s on the 5s frame so
    // history stays stitched, 15s elsewhere — live ticks paint between pulls
    const trueUp = setInterval(load, tf === "second" ? 10_000 : 15_000);

    return () => {
      disposed = true;
      clearInterval(trueUp);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volRef.current = null;
      lastBarRef.current = null;
    };
  }, [pairAddress, tfIdx]);

  // "your entry" price line — the single most useful marker on the chart
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (entryLineRef.current) {
      try {
        series.removePriceLine(entryLineRef.current);
      } catch {
        /* series was recreated under us */
      }
      entryLineRef.current = null;
    }
    if (!avgEntryUsd || avgEntryUsd <= 0) return;
    try {
      entryLineRef.current = series.createPriceLine({
        price: avgEntryUsd,
        color: "#d63c00",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "your entry",
      });
    } catch {
      /* ignore: the line is decoration, never critical */
    }
  }, [avgEntryUsd, pairAddress, tfIdx]);

  // paint the live tick onto the current candle
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !livePriceUsd || livePriceUsd <= 0) return;
    const secs = TIMEFRAMES[tfIdx].secs;

    // no indexed history for this pool? bootstrap a live-only candle — a chart
    // that builds itself in real time beats an empty panel
    if (!lastBarRef.current) {
      const bucket0 = (Math.floor(Date.now() / 1000 / secs) * secs) as UTCTimestamp;
      const seed: Bar = {
        time: bucket0,
        open: livePriceUsd,
        high: livePriceUsd,
        low: livePriceUsd,
        close: livePriceUsd,
      };
      try {
        series.applyOptions({ priceFormat: { type: "price", ...pricePrecision(livePriceUsd) } });
        series.setData([seed]);
        lastBarRef.current = seed;
        setEmpty(false);
      } catch {
        return;
      }
      return;
    }

    const last = lastBarRef.current;
    // clamp to the series clock — a client clock behind the data source must
    // merge into the last candle, never emit an out-of-order time (silent no-op)
    const clientBucket = (Math.floor(Date.now() / 1000 / secs) * secs) as UTCTimestamp;
    const bucket = (clientBucket > last.time ? clientBucket : last.time) as UTCTimestamp;

    let bar: Bar;
    if (bucket > last.time) {
      bar = {
        time: bucket,
        open: last.close,
        high: Math.max(last.close, livePriceUsd),
        low: Math.min(last.close, livePriceUsd),
        close: livePriceUsd,
      };
    } else {
      bar = {
        ...last,
        high: Math.max(last.high, livePriceUsd),
        low: Math.min(last.low, livePriceUsd),
        close: livePriceUsd,
      };
    }
    lastBarRef.current = bar;
    try {
      series.update(bar);
    } catch {
      // stale series during a reload — safe to skip a tick
    }
  }, [livePriceUsd, tfIdx]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-3 pt-2 pb-1">
        {TIMEFRAMES.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setTfIdx(i)}
            className={`mono text-[11px] px-2.5 py-1 rounded-md transition-colors ${
              i === tfIdx
                ? "text-[var(--cyan)] bg-[rgba(255,90,0,0.1)] border border-[rgba(255,90,0,0.35)]"
                : "text-[var(--ink-3)] hover:text-[var(--ink-2)] border border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto panel-title pr-2">live · usd</span>
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="mono text-xs text-[var(--ink-3)] animate-pulse">
              waiting for the first live tick…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
