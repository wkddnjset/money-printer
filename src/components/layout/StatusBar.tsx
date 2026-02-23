"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function StatusBar() {
  const { data: status } = useSWR("/api/engine/status", fetcher, {
    refreshInterval: 5000,
    fallbackData: {
      running: false,
      regime: "unknown",
      totalTradesToday: 0,
      winRateToday: 0,
    },
  });

  const regimeLabels: Record<string, string> = {
    trending_up: "상승 추세",
    trending_down: "하락 추세",
    ranging: "횡보",
    volatile: "고변동",
    unknown: "-",
  };

  return (
    <footer className="h-8 border-t border-[var(--color-border)] bg-[var(--color-surface)] flex items-center px-4 text-xs text-[var(--color-text-muted)] gap-6">
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            status.running ? "bg-[var(--color-green)]" : "bg-[var(--color-red)]"
          }`}
        />
        <span>Exchange: {status.running ? "Connected" : "Disconnected"}</span>
      </div>
      <div>
        레짐: <span className="text-[var(--color-text)]">{regimeLabels[status.regime] ?? status.regime}</span>
      </div>
      <div>
        오늘 거래: <span className="text-[var(--color-text)]">{status.totalTradesToday ?? 0}건</span>
      </div>
      <div>
        승률: <span className="text-[var(--color-text)]">{((status.winRateToday ?? 0) * 100).toFixed(1)}%</span>
      </div>
    </footer>
  );
}
