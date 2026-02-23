import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// 세션 목록 조회
export async function GET() {
  try {
    const db = getDb();

    const sessions = db.prepare(`
      SELECT id, started_at, ended_at, initial_balance, strategy_count, allocation_per_strategy, status
      FROM sessions ORDER BY id DESC LIMIT 50
    `).all() as {
      id: number; started_at: number; ended_at: number | null;
      initial_balance: number; strategy_count: number;
      allocation_per_strategy: number; status: string;
    }[];

    // 각 세션의 PnL 요약
    const sessionData = sessions.map((s) => {
      const pnlRow = db.prepare(`
        SELECT
          COUNT(*) as trade_count,
          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
          COALESCE(SUM(pnl), 0) as total_pnl
        FROM trades WHERE session_id = ? AND exit_at IS NOT NULL
      `).get(s.id) as { trade_count: number; wins: number; total_pnl: number };

      return {
        id: s.id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        initialBalance: s.initial_balance,
        strategyCount: s.strategy_count,
        allocationPerStrategy: s.allocation_per_strategy,
        status: s.status,
        tradeCount: pnlRow.trade_count,
        wins: pnlRow.wins,
        totalPnl: pnlRow.total_pnl,
      };
    });

    return NextResponse.json({ sessions: sessionData });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
