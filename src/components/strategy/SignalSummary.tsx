"use client";

import useSWR from "swr";
import type { SignalAction } from "@/types/strategy";
import type { IndependentSignalResult } from "@/types/signal";
import type { Symbol, Timeframe } from "@/types/candle";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ACTION_COLORS: Record<SignalAction, string> = {
  buy: "var(--color-green)",
  sell: "var(--color-red)",
  hold: "var(--color-text-muted)",
};

const ACTION_LABELS: Record<SignalAction, string> = {
  buy: "매수",
  sell: "매도",
  hold: "관망",
};

interface SignalSummaryProps {
  symbol: Symbol;
  timeframe: Timeframe;
}

export function SignalSummary({ symbol, timeframe }: SignalSummaryProps) {
  const { data, error } = useSWR<{ signals: IndependentSignalResult[] }>(
    `/api/strategies/signals?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  if (error) {
    return <p className="text-sm text-[var(--color-red)]">신호 로드 실패</p>;
  }

  if (!data) {
    return <p className="text-sm text-[var(--color-text-muted)]">신호 분석 중...</p>;
  }

  const signals = data.signals ?? [];
  const buyCount = signals.filter((s) => s.action === "buy").length;
  const sellCount = signals.filter((s) => s.action === "sell").length;
  const holdCount = signals.filter((s) => s.action === "hold").length;
  const positionCount = signals.filter((s) => s.hasOpenPosition).length;

  return (
    <div className="space-y-2">
      {/* 요약 */}
      <div className="flex items-center gap-3 text-xs">
        <span style={{ color: "var(--color-green)" }}>매수 {buyCount}</span>
        <span style={{ color: "var(--color-text-muted)" }}>관망 {holdCount}</span>
        <span style={{ color: "var(--color-red)" }}>매도 {sellCount}</span>
        <span className="ml-auto text-[var(--color-accent)]">포지션 {positionCount}</span>
      </div>

      {/* 전략별 리스트 */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {signals.map((s) => (
          <div
            key={s.strategyId}
            className="flex items-center justify-between text-xs p-1.5 rounded bg-[var(--color-bg)]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="font-bold w-6 text-center"
                style={{ color: ACTION_COLORS[s.action] }}
              >
                {ACTION_LABELS[s.action]}
              </span>
              <span className="text-[var(--color-text-muted)] truncate">
                {s.strategyName}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {s.adjustedConfidence != null && s.adjustedConfidence !== s.confidence ? (
                <span className="font-mono text-amber-400" title={`원래 ${(s.confidence * 100).toFixed(0)}% → 학습 조정`}>
                  {(s.adjustedConfidence * 100).toFixed(0)}%
                </span>
              ) : (
                <span className="font-mono text-[var(--color-text-muted)]">
                  {(s.confidence * 100).toFixed(0)}%
                </span>
              )}
              {s.minConfidence != null && s.minConfidence > 0.5 && (
                <span className="text-[10px] text-amber-400" title={`임계값 ${(s.minConfidence * 100).toFixed(0)}%`}>
                  /{(s.minConfidence * 100).toFixed(0)}
                </span>
              )}
              {s.hasOpenPosition && (
                <span
                  className="font-mono font-bold"
                  style={{
                    color: (s.unrealizedPnl ?? 0) >= 0 ? "var(--color-green)" : "var(--color-red)",
                  }}
                >
                  {(s.unrealizedPnl ?? 0) >= 0 ? "+" : ""}${(s.unrealizedPnl ?? 0).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
