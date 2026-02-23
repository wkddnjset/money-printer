"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/common/Card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Period = "1d" | "7d" | "30d" | "90d";

interface OverallStats {
  totalTrades: number;
  wins: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
  totalFees: number;
}

interface StrategyStats {
  strategyId: string;
  tradeCount: number;
  wins: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
}

interface DailyPnl {
  date: string;
  trades: number;
  wins: number;
  pnl: number;
}

interface AllTimeStats {
  totalTrades: number;
  wins: number;
  winRate: number;
  totalPnl: number;
  totalFees: number;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("7d");
  const [sessionFilter, setSessionFilter] = useState("");

  const sessionParam = sessionFilter ? `&session=${sessionFilter}` : "";
  const { data } = useSWR<{
    allTime: AllTimeStats;
    overall: OverallStats;
    strategies: StrategyStats[];
    dailyPnl: DailyPnl[];
  }>(`/api/analytics?period=${period}${sessionParam}`, fetcher, { refreshInterval: 5000 });

  const allTime = data?.allTime;
  const overall = data?.overall;
  const strategies = data?.strategies ?? [];
  const dailyPnl = data?.dailyPnl ?? [];

  // 누적 수익 계산
  let cumPnl = 0;
  const cumData = dailyPnl.map((d) => {
    cumPnl += d.pnl;
    return { ...d, cumPnl };
  });

  // PnL 바 차트 최대값
  const maxAbsPnl = Math.max(...dailyPnl.map((d) => Math.abs(d.pnl)), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">수익 분석</h1>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="세션 ID..."
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-1 text-sm w-24"
          />
          <div className="flex rounded border border-[var(--color-border)] overflow-hidden">
            {(["1d", "7d", "30d", "90d"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-sm transition-colors ${
                  period === p
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 누적 PnL (all-time) */}
      {allTime && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[var(--color-text-muted)]">누적 P&L (전체)</div>
              <div
                className="text-xl font-mono font-bold"
                style={{ color: allTime.totalPnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
              >
                {allTime.totalPnl >= 0 ? "+" : ""}{allTime.totalPnl.toFixed(2)} USDC
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono">{allTime.totalTrades}건</div>
              <div className="text-xs text-[var(--color-text-muted)]">
                승률 {(allTime.winRate * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 기간별 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        <Card title="기간 거래">
          <p className="text-lg font-mono font-bold">{overall?.totalTrades ?? 0}</p>
        </Card>
        <Card title="승률">
          <p className="text-lg font-mono font-bold">
            {((overall?.winRate ?? 0) * 100).toFixed(1)}%
          </p>
        </Card>
        <Card title="기간 손익">
          <p
            className="text-lg font-mono font-bold"
            style={{ color: (overall?.totalPnl ?? 0) >= 0 ? "var(--color-green)" : "var(--color-red)" }}
          >
            {(overall?.totalPnl ?? 0) >= 0 ? "+" : ""}{(overall?.totalPnl ?? 0).toFixed(2)} USDC
          </p>
        </Card>
        <Card title="총 수수료">
          <p className="text-lg font-mono font-bold text-[var(--color-text-muted)]">
            {(overall?.totalFees ?? 0).toFixed(2)} USDC
          </p>
        </Card>
      </div>

      {/* 최고/최악 거래 */}
      <div className="grid grid-cols-2 gap-3">
        <Card title="최고 거래">
          <p className="text-lg font-mono font-bold text-[var(--color-green)]">
            +{(overall?.bestTrade ?? 0).toFixed(2)} USDC
          </p>
        </Card>
        <Card title="최악 거래">
          <p className="text-lg font-mono font-bold text-[var(--color-red)]">
            {(overall?.worstTrade ?? 0).toFixed(2)} USDC
          </p>
        </Card>
      </div>

      {/* 일별 PnL 바 차트 */}
      <Card title="일별 손익">
        {dailyPnl.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">데이터가 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {cumData.map((d) => {
              const barWidth = Math.abs(d.pnl) / maxAbsPnl * 100;
              const isProfit = d.pnl >= 0;
              return (
                <div key={d.date} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-[var(--color-text-muted)] font-mono">{d.date.slice(5)}</span>
                  <div className="flex-1 flex items-center h-5">
                    <div className="w-1/2 flex justify-end">
                      {!isProfit && (
                        <div
                          className="h-4 rounded-l"
                          style={{ width: `${barWidth}%`, backgroundColor: "var(--color-red)" }}
                        />
                      )}
                    </div>
                    <div className="w-px h-5 bg-[var(--color-border)]" />
                    <div className="w-1/2">
                      {isProfit && (
                        <div
                          className="h-4 rounded-r"
                          style={{ width: `${barWidth}%`, backgroundColor: "var(--color-green)" }}
                        />
                      )}
                    </div>
                  </div>
                  <span
                    className="w-20 text-right font-mono"
                    style={{ color: isProfit ? "var(--color-green)" : "var(--color-red)" }}
                  >
                    {isProfit ? "+" : ""}{d.pnl.toFixed(2)}
                  </span>
                  <span className="w-24 text-right font-mono text-[var(--color-text-muted)]">
                    누적 {d.cumPnl >= 0 ? "+" : ""}{d.cumPnl.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 전략별 성과 */}
      <Card title="전략별 성과">
        {strategies.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-left">
                  <th className="py-2 px-3">전략</th>
                  <th className="py-2 px-3 text-right">거래</th>
                  <th className="py-2 px-3 text-right">승률</th>
                  <th className="py-2 px-3 text-right">총 손익</th>
                  <th className="py-2 px-3 text-right">평균 손익</th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((s) => (
                  <tr key={s.strategyId} className="border-b border-[var(--color-border)]">
                    <td className="py-2 px-3">
                      <span className="text-xs bg-[var(--color-border)] rounded px-1.5 py-0.5">
                        {s.strategyId}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{s.tradeCount}</td>
                    <td className="py-2 px-3 text-right font-mono">{(s.winRate * 100).toFixed(0)}%</td>
                    <td
                      className="py-2 px-3 text-right font-mono font-bold"
                      style={{ color: s.totalPnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
                    >
                      {s.totalPnl >= 0 ? "+" : ""}{s.totalPnl.toFixed(2)}
                    </td>
                    <td
                      className="py-2 px-3 text-right font-mono"
                      style={{ color: s.avgPnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
                    >
                      {s.avgPnl >= 0 ? "+" : ""}{s.avgPnl.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
