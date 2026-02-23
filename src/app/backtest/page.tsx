"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Card } from "@/components/common/Card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface BacktestResultRow {
  id: number; strategyId: string; timeframe: string;
  winRate: number; totalReturn: number; maxDrawdown: number;
  sharpeRatio: number | null; tradeCount: number; createdAt: number;
}

export default function BacktestPage() {
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [running, setRunning] = useState(false);
  const [backtestResult, setBacktestResult] = useState<{
    winRate: number; totalReturn: number; maxDrawdown: number;
    sharpeRatio: number; tradeCount: number; profitFactor: number;
  } | null>(null);

  // 전략 목록
  const { data: configData } = useSWR<{ configs: { strategyId: string; name: string; category: string }[] }>(
    "/api/strategies/configs", fetcher,
  );

  // 백테스트 이력
  const { data: historyData } = useSWR<{ results: BacktestResultRow[] }>(
    "/api/backtest?limit=20", fetcher,
  );

  // 리밸런싱 이력
  const { data: rebalanceData } = useSWR<{ logs: {
    id: number; executedAt: number; strategyId: string;
    changeType: string; oldValue: string; newValue: string; reason: string;
  }[] }>(
    "/api/backtest/rebalance?limit=20", fetcher,
  );

  const strategies = configData?.configs ?? [];
  const history = historyData?.results ?? [];
  const rebalanceLogs = rebalanceData?.logs ?? [];

  async function handleBacktest(optimize: boolean) {
    if (!selectedStrategy) return;
    setRunning(true);
    setBacktestResult(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: selectedStrategy,
          days: 7,
          optimize,
        }),
      });
      const data = await res.json();
      if (optimize) {
        setBacktestResult(data.gridSearch?.topResults?.[0] ? {
          winRate: data.gridSearch.topResults[0].winRate,
          totalReturn: data.gridSearch.topResults[0].totalReturn,
          sharpeRatio: data.gridSearch.topResults[0].sharpeRatio,
          maxDrawdown: 0,
          tradeCount: data.gridSearch.testedCombinations,
          profitFactor: 0,
        } : null);
      } else {
        setBacktestResult(data);
      }
      mutate("/api/backtest?limit=20");
    } finally {
      setRunning(false);
    }
  }

  async function handleRebalance() {
    setRunning(true);
    try {
      await fetch("/api/backtest/rebalance", { method: "POST" });
      mutate("/api/backtest/rebalance?limit=20");
      mutate("/api/strategies/configs");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">백테스트 & 최적화</h1>

      {/* 백테스트 실행 패널 */}
      <Card title="백테스트 실행">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-1.5 text-sm"
            >
              <option value="">전략 선택...</option>
              {strategies.map((s) => (
                <option key={s.strategyId} value={s.strategyId}>
                  [{s.category}] {s.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => handleBacktest(false)}
              disabled={!selectedStrategy || running}
              className="px-4 py-1.5 rounded text-sm bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {running ? "..." : "백테스트"}
            </button>
            <button
              onClick={() => handleBacktest(true)}
              disabled={!selectedStrategy || running}
              className="px-4 py-1.5 rounded text-sm bg-[var(--color-green)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {running ? "..." : "최적화"}
            </button>
          </div>

          {/* 결과 표시 */}
          {backtestResult && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-[var(--color-bg)] rounded">
              <div>
                <span className="text-xs text-[var(--color-text-muted)]">승률</span>
                <p className="font-mono font-bold">{(backtestResult.winRate * 100).toFixed(1)}%</p>
              </div>
              <div>
                <span className="text-xs text-[var(--color-text-muted)]">총 수익률</span>
                <p className="font-mono font-bold" style={{
                  color: backtestResult.totalReturn >= 0 ? "var(--color-green)" : "var(--color-red)",
                }}>
                  {backtestResult.totalReturn >= 0 ? "+" : ""}{backtestResult.totalReturn.toFixed(2)}%
                </p>
              </div>
              <div>
                <span className="text-xs text-[var(--color-text-muted)]">샤프 비율</span>
                <p className="font-mono font-bold">{backtestResult.sharpeRatio.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-xs text-[var(--color-text-muted)]">최대 드로다운</span>
                <p className="font-mono font-bold text-[var(--color-red)]">-{backtestResult.maxDrawdown.toFixed(2)}%</p>
              </div>
              <div>
                <span className="text-xs text-[var(--color-text-muted)]">거래 수</span>
                <p className="font-mono font-bold">{backtestResult.tradeCount}</p>
              </div>
              <div>
                <span className="text-xs text-[var(--color-text-muted)]">수익 팩터</span>
                <p className="font-mono font-bold">{backtestResult.profitFactor.toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 리밸런싱 */}
      <Card title="일일 리밸런싱">
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            모든 전략에 대해 그리드 탐색 + 워크포워드 검증을 실행하여 파라미터와 가중치를 자동 최적화합니다.
          </p>
          <button
            onClick={handleRebalance}
            disabled={running}
            className="px-4 py-1.5 rounded text-sm bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {running ? "리밸런싱 실행 중..." : "수동 리밸런싱 실행"}
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {/* 백테스트 이력 */}
        <Card title="최근 백테스트 결과">
          {history.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">결과가 없습니다.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 bg-[var(--color-bg)] rounded text-xs">
                  <div>
                    <span className="font-bold">{r.strategyId}</span>
                    <span className="text-[var(--color-text-muted)] ml-2">
                      {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <div className="flex gap-3 font-mono">
                    <span>승률 {(r.winRate * 100).toFixed(0)}%</span>
                    <span style={{ color: r.totalReturn >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
                      {r.totalReturn >= 0 ? "+" : ""}{r.totalReturn.toFixed(1)}%
                    </span>
                    <span>{r.tradeCount}건</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 리밸런싱 이력 */}
        <Card title="리밸런싱 변경 이력">
          {rebalanceLogs.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">이력이 없습니다.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {rebalanceLogs.map((log) => (
                <div key={log.id} className="p-2 bg-[var(--color-bg)] rounded text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{log.strategyId}</span>
                    <span className="text-[var(--color-text-muted)]">
                      {new Date(log.executedAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-1 py-0.5 rounded bg-[var(--color-border)]">
                      {log.changeType}
                    </span>
                    <span className="text-[var(--color-text-muted)]">{log.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
