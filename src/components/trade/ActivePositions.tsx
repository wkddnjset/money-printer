"use client";

import useSWR from "swr";
import type { Trade } from "@/types/trade";
import { Card } from "@/components/common/Card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ActivePositions() {
  const { data } = useSWR<{ trades: Trade[] }>(
    "/api/trades?status=open&limit=50",
    fetcher,
    { refreshInterval: 5000 }
  );

  const { data: tickerData } = useSWR<{ last: number }>(
    "/api/exchange/ticker",
    fetcher,
    { refreshInterval: 5000 }
  );

  const positions = data?.trades ?? [];
  const currentPrice = tickerData?.last ?? 0;

  // 전략별 그룹핑
  const grouped = new Map<string, Trade[]>();
  for (const pos of positions) {
    const existing = grouped.get(pos.strategyId) ?? [];
    existing.push(pos);
    grouped.set(pos.strategyId, existing);
  }

  // 미실현 손익 합계
  const totalUnrealizedPnl = positions.reduce((sum, pos) => {
    if (currentPrice <= 0) return sum;
    const pnl = (currentPrice - pos.entryPrice) * pos.quantity;
    return sum + pnl;
  }, 0);

  return (
    <Card title={`활성 포지션 (${positions.length})`}>
      {positions.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">열린 포지션이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {Array.from(grouped.entries()).map(([strategyId, trades]) => (
            <div key={strategyId}>
              {trades.map((pos) => {
                const unrealizedPnl =
                  currentPrice > 0
                    ? (currentPrice - pos.entryPrice) * pos.quantity
                    : 0;
                const pnlPercent =
                  pos.entryPrice > 0
                    ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
                    : 0;

                return (
                  <div
                    key={pos.id}
                    className="flex items-center justify-between p-2 rounded bg-[var(--color-bg)]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-bold"
                        style={{ color: "var(--color-green)" }}
                      >
                        LONG
                      </span>
                      <span className="text-sm font-mono">{pos.symbol}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {strategyId}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm font-mono">
                      <span className="text-[var(--color-text-muted)]">
                        ${pos.entryPrice.toFixed(4)}
                      </span>
                      <span
                        className="font-bold"
                        style={{
                          color: unrealizedPnl >= 0 ? "var(--color-green)" : "var(--color-red)",
                        }}
                      >
                        {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(2)}
                        <span className="text-xs ml-0.5">
                          ({pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* 미실현 손익 합계 */}
          {currentPrice > 0 && (
            <div className="flex justify-between pt-1 border-t border-[var(--color-border)] text-xs">
              <span className="text-[var(--color-text-muted)]">미실현 손익 합계</span>
              <span
                className="font-mono font-bold"
                style={{
                  color: totalUnrealizedPnl >= 0 ? "var(--color-green)" : "var(--color-red)",
                }}
              >
                {totalUnrealizedPnl >= 0 ? "+" : ""}${totalUnrealizedPnl.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
