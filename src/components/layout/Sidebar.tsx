"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/strategies", label: "전략 관리", icon: "🎯" },
  { href: "/trades", label: "거래 내역", icon: "📋" },
  { href: "/analytics", label: "수익 분석", icon: "📈" },
  { href: "/backtest", label: "백테스트", icon: "🔬" },
  { href: "/settings", label: "설정", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-48 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
      <div className="p-4 border-b border-[var(--color-border)]">
        <h1 className="text-lg font-bold text-[var(--color-accent)]">
          Money Printer
        </h1>
        <p className="text-xs text-[var(--color-text-muted)]">v1.0.0</p>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                isActive
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/5"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
