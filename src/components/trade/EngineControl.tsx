"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Card } from "@/components/common/Card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function EngineControl() {
  const [loading, setLoading] = useState(false);

  const { data } = useSWR<{
    running: boolean;
    paperMode: boolean;
    openPositions: number;
    todayTrades: number;
    todayPnl: number;
  }>("/api/engine/control", fetcher, { refreshInterval: 5000 });

  const isRunning = data?.running ?? false;

  async function handleAction(action: "start" | "stop" | "tick") {
    setLoading(true);
    try {
      await fetch("/api/engine/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      mutate("/api/engine/control");
      mutate("/api/engine/status");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="엔진 제어">
      <div className="space-y-3">
        {/* 상태 표시 */}
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: isRunning ? "var(--color-green)" : "var(--color-red)",
              boxShadow: isRunning ? "0 0 6px var(--color-green)" : undefined,
            }}
          />
          <span className="text-sm font-bold">
            {isRunning ? "실행 중" : "중지됨"}
          </span>
          {data?.paperMode && (
            <span className="text-xs bg-[var(--color-accent)] text-white px-1.5 py-0.5 rounded">
              PAPER
            </span>
          )}
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-[var(--color-text-muted)]">포지션</span>
            <p className="font-mono font-bold">{data?.openPositions ?? 0}</p>
          </div>
          <div>
            <span className="text-[var(--color-text-muted)]">오늘 거래</span>
            <p className="font-mono font-bold">{data?.todayTrades ?? 0}</p>
          </div>
          <div>
            <span className="text-[var(--color-text-muted)]">오늘 손익</span>
            <p
              className="font-mono font-bold"
              style={{
                color: (data?.todayPnl ?? 0) >= 0 ? "var(--color-green)" : "var(--color-red)",
              }}
            >
              {(data?.todayPnl ?? 0) >= 0 ? "+" : ""}{(data?.todayPnl ?? 0).toFixed(2)}
            </p>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2">
          {isRunning ? (
            <button
              onClick={() => handleAction("stop")}
              disabled={loading}
              className="flex-1 py-1.5 rounded text-sm font-bold bg-[var(--color-red)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "..." : "중지"}
            </button>
          ) : (
            <button
              onClick={() => handleAction("start")}
              disabled={loading}
              className="flex-1 py-1.5 rounded text-sm font-bold bg-[var(--color-green)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "..." : "시작"}
            </button>
          )}
          <button
            onClick={() => handleAction("tick")}
            disabled={loading}
            className="px-3 py-1.5 rounded text-sm bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-border)] disabled:opacity-50"
          >
            수동 틱
          </button>
        </div>
      </div>
    </Card>
  );
}
