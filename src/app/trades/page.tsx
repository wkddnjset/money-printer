"use client";

import { useState } from "react";
import useSWR from "swr";
import { TradeTable } from "@/components/trade/TradeTable";
import { ActivePositions } from "@/components/trade/ActivePositions";
import { Card } from "@/components/common/Card";
import type { Trade } from "@/types/trade";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type FilterStatus = "all" | "open" | "closed";

export default function TradesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<FilterStatus>("all");
  const [strategyFilter, setStrategyFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "30");
  if (status !== "all") params.set("status", status);
  if (strategyFilter) params.set("strategy", strategyFilter);
  if (sessionFilter) params.set("session", sessionFilter);

  const { data } = useSWR<{
    trades: Trade[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/api/trades?${params.toString()}`, fetcher, { refreshInterval: 5000 });

  const trades = data?.trades ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 30, total: 0, totalPages: 0 };

  // 통계 계산
  const { data: allStats } = useSWR<{ trades: Trade[] }>(
    "/api/trades?status=closed&limit=100",
    fetcher,
    { refreshInterval: 5000 }
  );
  const closedTrades = allStats?.trades ?? [];
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const winCount = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">거래 내역</h1>

      {/* 상단 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        <Card title="총 거래">
          <p className="text-lg font-mono font-bold">{pagination.total}</p>
        </Card>
        <Card title="승률">
          <p className="text-lg font-mono font-bold">{winRate.toFixed(1)}%</p>
        </Card>
        <Card title="총 손익">
          <p
            className="text-lg font-mono font-bold"
            style={{ color: totalPnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
          >
            {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} USDC
          </p>
        </Card>
        <Card title="평균 손익">
          <p className="text-lg font-mono font-bold">
            {closedTrades.length > 0
              ? `${(totalPnl / closedTrades.length).toFixed(2)} USDC`
              : "-"}
          </p>
        </Card>
      </div>

      {/* 활성 포지션 */}
      <ActivePositions />

      {/* 필터 */}
      <div className="flex items-center gap-3">
        <div className="flex rounded border border-[var(--color-border)] overflow-hidden">
          {(["all", "open", "closed"] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={`px-3 py-1 text-sm transition-colors ${
                status === s
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {s === "all" ? "전체" : s === "open" ? "진행중" : "완료"}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="전략 ID 필터..."
          value={strategyFilter}
          onChange={(e) => { setStrategyFilter(e.target.value); setPage(1); }}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-1 text-sm w-48"
        />

        <input
          type="text"
          placeholder="세션 ID..."
          value={sessionFilter}
          onChange={(e) => { setSessionFilter(e.target.value); setPage(1); }}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-1 text-sm w-24"
        />
      </div>

      {/* 거래 테이블 */}
      <Card>
        <TradeTable trades={trades} />
      </Card>

      {/* 페이지네이션 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded text-sm bg-[var(--color-surface)] border border-[var(--color-border)] disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-[var(--color-text-muted)]">
            {page} / {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="px-3 py-1 rounded text-sm bg-[var(--color-surface)] border border-[var(--color-border)] disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
