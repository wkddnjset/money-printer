"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Header() {
  const { data: status } = useSWR("/api/engine/status", fetcher, {
    refreshInterval: 5000,
    fallbackData: {
      running: false,
      paperMode: true,
      balance: { USDC: 0 },
      wallet: { usdc: 0, wld: 0, wldPrice: 0, wldValue: 0, total: 0 },
      todayPnl: { amount: 0, percent: 0 },
    },
  });

  const walletUsdc = status?.wallet?.usdc ?? 0;
  const walletWld = status?.wallet?.wld ?? 0;
  const walletTotal = status?.wallet?.total ?? status?.balance?.USDC ?? 0;
  const todayAmount = status?.todayPnl?.amount ?? 0;
  const todayPercent = status?.todayPnl?.percent ?? 0;
  const pnlColor =
    todayAmount >= 0 ? "var(--color-green)" : "var(--color-red)";

  return (
    <header className="h-12 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between px-4">
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">총 자산:</span>
          <span className="font-mono font-bold">
            ${walletTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            ({walletUsdc.toFixed(1)} USDC{walletWld > 0.001 ? ` + ${walletWld.toFixed(1)} WLD` : ""})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">오늘:</span>
          <span className="font-mono font-bold" style={{ color: pnlColor }}>
            {todayAmount >= 0 ? "+" : ""}
            {todayAmount.toFixed(2)}
          </span>
          <span className="text-xs" style={{ color: pnlColor }}>
            ({todayPercent.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        {status?.paperMode && (
          <span className="px-2 py-0.5 rounded bg-[var(--color-yellow)]/20 text-[var(--color-yellow)] text-xs font-medium">
            PAPER MODE
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              status?.running ? "bg-[var(--color-green)]" : "bg-[var(--color-red)]"
            }`}
          />
          <span>{status?.running ? "실행중" : "중지됨"}</span>
        </div>
      </div>
    </header>
  );
}
