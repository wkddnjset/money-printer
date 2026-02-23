"use client";

import type { Trade } from "@/types/trade";

interface TradeTableProps {
  trades: Trade[];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function TradeTable({ trades }: TradeTableProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--color-text-muted)]">
        아직 거래 기록이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-left">
            <th className="py-2 px-3">시간</th>
            <th className="py-2 px-3">전략</th>
            <th className="py-2 px-3">방향</th>
            <th className="py-2 px-3 text-right">진입가</th>
            <th className="py-2 px-3 text-right">청산가</th>
            <th className="py-2 px-3 text-right">수량</th>
            <th className="py-2 px-3 text-right">손익</th>
            <th className="py-2 px-3 text-right">수익률</th>
            <th className="py-2 px-3">상태</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const isOpen = trade.exitPrice === null;
            const isProfitable = (trade.pnl ?? 0) > 0;

            return (
              <tr
                key={trade.id}
                className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]"
              >
                <td className="py-2 px-3 font-mono text-xs">
                  {formatTime(trade.entryAt)}
                </td>
                <td className="py-2 px-3">
                  <span className="text-xs bg-[var(--color-border)] rounded px-1.5 py-0.5">
                    {trade.strategyId}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <span
                    className="font-bold text-xs"
                    style={{
                      color: trade.side === "buy" ? "var(--color-green)" : "var(--color-red)",
                    }}
                  >
                    {trade.side === "buy" ? "매수" : "매도"}
                  </span>
                </td>
                <td className="py-2 px-3 text-right font-mono">
                  ${trade.entryPrice.toFixed(4)}
                </td>
                <td className="py-2 px-3 text-right font-mono">
                  {isOpen ? "-" : `$${trade.exitPrice!.toFixed(4)}`}
                </td>
                <td className="py-2 px-3 text-right font-mono">
                  {trade.quantity.toFixed(2)}
                </td>
                <td
                  className="py-2 px-3 text-right font-mono font-bold"
                  style={{
                    color: isOpen
                      ? "var(--color-text-muted)"
                      : isProfitable
                        ? "var(--color-green)"
                        : "var(--color-red)",
                  }}
                >
                  {isOpen ? "-" : `${isProfitable ? "+" : ""}${trade.pnl!.toFixed(2)}`}
                </td>
                <td
                  className="py-2 px-3 text-right font-mono"
                  style={{
                    color: isOpen
                      ? "var(--color-text-muted)"
                      : isProfitable
                        ? "var(--color-green)"
                        : "var(--color-red)",
                  }}
                >
                  {isOpen ? "-" : `${isProfitable ? "+" : ""}${trade.pnlPercent!.toFixed(2)}%`}
                </td>
                <td className="py-2 px-3">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: isOpen ? "var(--color-accent)" : "var(--color-border)",
                      color: isOpen ? "white" : "var(--color-text-muted)",
                    }}
                  >
                    {isOpen ? "진행중" : "완료"}
                  </span>
                  {trade.isPaper && (
                    <span className="text-xs text-[var(--color-text-muted)] ml-1">P</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
