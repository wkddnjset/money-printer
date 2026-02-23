import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// 수익 분석 데이터 조회 (전체 누적 + 세션별)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? "7d";
    const sessionId = searchParams.get("session"); // 세션 필터 (optional)
    const daysMap: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 };
    const days = daysMap[period] ?? 7;

    const db = getDb();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    // === 전체 누적 P&L (all-time) ===
    const allTimeStats = db.prepare(`
      SELECT
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        COALESCE(SUM(pnl), 0) as total_pnl,
        COALESCE(SUM(fee), 0) as total_fees
      FROM trades
      WHERE exit_at IS NOT NULL
    `).get() as { total_trades: number; wins: number; total_pnl: number; total_fees: number };

    // === 기간별 통계 ===
    const sessionFilter = sessionId ? " AND session_id = ?" : "";
    const sessionParams = sessionId ? [since, Number(sessionId)] : [since];

    const overallStats = db.prepare(`
      SELECT
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        COALESCE(SUM(pnl), 0) as total_pnl,
        COALESCE(AVG(pnl), 0) as avg_pnl,
        COALESCE(MAX(pnl), 0) as best_trade,
        COALESCE(MIN(pnl), 0) as worst_trade,
        COALESCE(SUM(fee), 0) as total_fees
      FROM trades
      WHERE exit_at IS NOT NULL AND exit_at >= ?${sessionFilter}
    `).get(...sessionParams) as {
      total_trades: number; wins: number; total_pnl: number; avg_pnl: number;
      best_trade: number; worst_trade: number; total_fees: number;
    };

    // 전략별 성과
    const strategyStats = db.prepare(`
      SELECT
        strategy_id,
        COUNT(*) as trade_count,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        COALESCE(SUM(pnl), 0) as total_pnl,
        COALESCE(AVG(pnl), 0) as avg_pnl
      FROM trades
      WHERE exit_at IS NOT NULL AND exit_at >= ?${sessionFilter}
      GROUP BY strategy_id
      ORDER BY total_pnl DESC
    `).all(...sessionParams) as {
      strategy_id: string; trade_count: number; wins: number;
      total_pnl: number; avg_pnl: number;
    }[];

    // 일별 수익
    const dailyPnl = db.prepare(`
      SELECT
        date(exit_at / 1000, 'unixepoch') as date,
        COUNT(*) as trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        COALESCE(SUM(pnl), 0) as pnl
      FROM trades
      WHERE exit_at IS NOT NULL AND exit_at >= ?${sessionFilter}
      GROUP BY date(exit_at / 1000, 'unixepoch')
      ORDER BY date ASC
    `).all(...sessionParams) as { date: string; trades: number; wins: number; pnl: number }[];

    // 일별 성과 테이블
    const dailyPerformance = db.prepare(`
      SELECT * FROM daily_performance ORDER BY date DESC LIMIT ?
    `).all(days) as {
      date: string; starting_balance: number; ending_balance: number;
      total_pnl: number; trade_count: number; win_count: number;
      best_strategy: string | null; worst_strategy: string | null; regime: string | null;
    }[];

    // 세션 목록 (요약)
    const sessions = db.prepare(`
      SELECT id, started_at, ended_at, initial_balance, strategy_count, allocation_per_strategy, status
      FROM sessions ORDER BY id DESC LIMIT 10
    `).all() as {
      id: number; started_at: number; ended_at: number | null;
      initial_balance: number; strategy_count: number;
      allocation_per_strategy: number; status: string;
    }[];

    return NextResponse.json({
      period,
      allTime: {
        totalTrades: allTimeStats.total_trades,
        wins: allTimeStats.wins,
        winRate: allTimeStats.total_trades > 0 ? allTimeStats.wins / allTimeStats.total_trades : 0,
        totalPnl: allTimeStats.total_pnl,
        totalFees: allTimeStats.total_fees,
      },
      overall: {
        totalTrades: overallStats.total_trades,
        wins: overallStats.wins,
        winRate: overallStats.total_trades > 0 ? overallStats.wins / overallStats.total_trades : 0,
        totalPnl: overallStats.total_pnl,
        avgPnl: overallStats.avg_pnl,
        bestTrade: overallStats.best_trade,
        worstTrade: overallStats.worst_trade,
        totalFees: overallStats.total_fees,
      },
      strategies: strategyStats.map((s) => ({
        strategyId: s.strategy_id,
        tradeCount: s.trade_count,
        wins: s.wins,
        winRate: s.trade_count > 0 ? s.wins / s.trade_count : 0,
        totalPnl: s.total_pnl,
        avgPnl: s.avg_pnl,
      })),
      dailyPnl,
      dailyPerformance: dailyPerformance.map((d) => ({
        date: d.date,
        startingBalance: d.starting_balance,
        endingBalance: d.ending_balance,
        totalPnl: d.total_pnl,
        tradeCount: d.trade_count,
        winCount: d.win_count,
        bestStrategy: d.best_strategy,
        worstStrategy: d.worst_strategy,
        regime: d.regime,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        initialBalance: s.initial_balance,
        strategyCount: s.strategy_count,
        allocationPerStrategy: s.allocation_per_strategy,
        status: s.status,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
