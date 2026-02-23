"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
  ColorType,
} from "lightweight-charts";
import type { OHLCV } from "@/types/candle";
import type { IndicatorResult } from "@/types/indicator";

interface OverlayData {
  id: string;
  label: string;
  color: string;
  data: LineData<Time>[];
}

interface Props {
  candles: OHLCV[];
  overlays?: OverlayData[];
  height?: number;
}

function toChartTime(ts: number): Time {
  return (ts / 1000) as Time;
}

export function CandlestickChart({ candles, overlays = [], height = 400 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  // 차트 초기화
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#12121a" },
        textColor: "#888",
      },
      grid: {
        vertLines: { color: "#1e1e2e" },
        horzLines: { color: "#1e1e2e" },
      },
      crosshair: {
        mode: 0,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#1e1e2e",
      },
      rightPriceScale: {
        borderColor: "#1e1e2e",
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // 리사이즈 대응
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      lineSeriesRefs.current.clear();
    };
  }, [height]);

  // 캔들 데이터 업데이트
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const chartData: CandlestickData<Time>[] = candles.map((c) => ({
      time: toChartTime(c.timestamp),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeriesRef.current.setData(chartData);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // 오버레이 업데이트
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // 기존 오버레이 제거 (없어진 것만)
    const currentIds = new Set(overlays.map((o) => o.id));
    for (const [id, series] of lineSeriesRefs.current) {
      if (!currentIds.has(id)) {
        chart.removeSeries(series);
        lineSeriesRefs.current.delete(id);
      }
    }

    // 오버레이 추가/업데이트
    for (const overlay of overlays) {
      let series = lineSeriesRefs.current.get(overlay.id);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: overlay.color,
          lineWidth: 1,
          title: overlay.label,
        });
        lineSeriesRefs.current.set(overlay.id, series);
      }
      series.setData(overlay.data);
    }
  }, [overlays]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded border border-[var(--color-border)]"
    />
  );
}

// 지표 결과를 차트 오버레이 데이터로 변환하는 헬퍼
export function indicatorToOverlay(
  results: IndicatorResult[],
  valueKey: string,
  label: string,
  color: string
): OverlayData {
  return {
    id: `${results[0]?.indicatorId ?? "unknown"}_${valueKey}`,
    label,
    color,
    data: results.map((r) => ({
      time: toChartTime(r.timestamp),
      value: r.values[valueKey],
    })),
  };
}
