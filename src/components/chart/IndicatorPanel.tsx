"use client";

import type { IndicatorResult } from "@/types/indicator";

interface Props {
  rsi: IndicatorResult[];
  macd: IndicatorResult[];
}

export function IndicatorPanel({ rsi, macd }: Props) {
  const latestRSI = rsi[rsi.length - 1];
  const latestMACD = macd[macd.length - 1];

  const rsiValue = latestRSI?.values.value ?? 0;
  const macdValue = latestMACD?.values.macd ?? 0;
  const macdSignal = latestMACD?.values.signal ?? 0;
  const macdHistogram = latestMACD?.values.histogram ?? 0;

  const rsiColor =
    rsiValue > 70
      ? "var(--color-red)"
      : rsiValue < 30
        ? "var(--color-green)"
        : "var(--color-text)";

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* RSI */}
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="text-xs text-[var(--color-text-muted)] mb-1">
          RSI (14)
        </div>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-mono font-bold" style={{ color: rsiColor }}>
            {rsiValue.toFixed(1)}
          </span>
          <span className="text-xs text-[var(--color-text-muted)] pb-1">
            {rsiValue > 70 ? "과매수" : rsiValue < 30 ? "과매도" : "중립"}
          </span>
        </div>
        {/* RSI 바 */}
        <div className="mt-2 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(rsiValue, 100)}%`,
              backgroundColor: rsiColor,
            }}
          />
        </div>
      </div>

      {/* MACD */}
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="text-xs text-[var(--color-text-muted)] mb-1">
          MACD (12, 26, 9)
        </div>
        <div className="flex items-end gap-3">
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">MACD</div>
            <span
              className="text-lg font-mono font-bold"
              style={{
                color: macdValue > 0 ? "var(--color-green)" : "var(--color-red)",
              }}
            >
              {macdValue.toFixed(4)}
            </span>
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">Signal</div>
            <span className="text-sm font-mono">{macdSignal.toFixed(4)}</span>
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">Hist</div>
            <span
              className="text-sm font-mono"
              style={{
                color:
                  macdHistogram > 0 ? "var(--color-green)" : "var(--color-red)",
              }}
            >
              {macdHistogram.toFixed(4)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
