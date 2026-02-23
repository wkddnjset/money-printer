import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { categoryRiskConfig } from "@/lib/config";
import type { StrategyCategory } from "@/types/strategy";

export async function GET() {
  try {
    const db = getDb();

    // 전략 설정
    const configs = db.prepare(
      "SELECT strategy_id, name, category, enabled, weight FROM strategy_configs ORDER BY category, strategy_id"
    ).all() as { strategy_id: string; name: string; category: string; enabled: number; weight: number }[];

    // 적응형 학습 상태
    const adaptiveRows = db.prepare(
      "SELECT strategy_id, min_confidence, win_pattern_count, loss_pattern_count, last_analyzed_at FROM strategy_adaptive"
    ).all() as { strategy_id: string; min_confidence: number; win_pattern_count: number; loss_pattern_count: number; last_analyzed_at: number }[];
    const adaptiveMap = new Map(adaptiveRows.map((r) => [r.strategy_id, r]));

    // 전략별 학습 데이터 통계
    const lessonStats = db.prepare(`
      SELECT strategy_id,
        COUNT(*) as total,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
        COALESCE(AVG(pnl), 0) as avgPnl,
        COALESCE(AVG(pnl_percent), 0) as avgPnlPercent,
        COALESCE(AVG(hold_duration), 0) as avgHoldDuration,
        COALESCE(MAX(pnl), 0) as bestTrade,
        COALESCE(MIN(pnl), 0) as worstTrade
      FROM strategy_lessons GROUP BY strategy_id
    `).all() as {
      strategy_id: string; total: number; wins: number; losses: number;
      avgPnl: number; avgPnlPercent: number; avgHoldDuration: number;
      bestTrade: number; worstTrade: number;
    }[];
    const lessonMap = new Map(lessonStats.map((r) => [r.strategy_id, r]));

    // 최근 5건 학습 기록 (전체)
    const recentLessons = db.prepare(`
      SELECT strategy_id, pnl, pnl_percent, hold_duration, market_regime, created_at
      FROM strategy_lessons ORDER BY created_at DESC LIMIT 50
    `).all() as {
      strategy_id: string; pnl: number; pnl_percent: number;
      hold_duration: number; market_regime: string | null; created_at: number;
    }[];
    const recentByStrategy = new Map<string, typeof recentLessons>();
    for (const l of recentLessons) {
      const arr = recentByStrategy.get(l.strategy_id) ?? [];
      if (arr.length < 5) arr.push(l);
      recentByStrategy.set(l.strategy_id, arr);
    }

    // 전략별 연속 손실 수
    const consecutiveMap = new Map<string, number>();
    for (const config of configs) {
      const trades = db.prepare(`
        SELECT pnl FROM trades
        WHERE strategy_id = ? AND exit_at IS NOT NULL AND pnl IS NOT NULL
        ORDER BY exit_at DESC LIMIT 20
      `).all(config.strategy_id) as { pnl: number }[];
      let count = 0;
      for (const t of trades) {
        if (t.pnl < 0) count++;
        else break;
      }
      consecutiveMap.set(config.strategy_id, count);
    }

    // 카테고리별 리스크 설정
    const riskByCategory: Record<string, { stopLossPercent: number; takeProfitPercent: number; maxConsecutiveLosses: number; consecutiveLossReduction: number; maxDailyLossPercent: number }> = {};
    for (const [cat, risk] of Object.entries(categoryRiskConfig)) {
      riskByCategory[cat] = {
        stopLossPercent: risk.stopLossPercent,
        takeProfitPercent: risk.takeProfitPercent,
        maxConsecutiveLosses: risk.maxConsecutiveLosses,
        consecutiveLossReduction: risk.consecutiveLossReduction,
        maxDailyLossPercent: risk.maxDailyLossPercent,
      };
    }

    const strategies = configs.map((c) => {
      const adaptive = adaptiveMap.get(c.strategy_id);
      const lesson = lessonMap.get(c.strategy_id);
      const recent = recentByStrategy.get(c.strategy_id) ?? [];
      const consecutive = consecutiveMap.get(c.strategy_id) ?? 0;
      const risk = categoryRiskConfig[c.category as StrategyCategory];

      return {
        strategyId: c.strategy_id,
        name: c.name,
        category: c.category,
        enabled: c.enabled === 1,
        weight: c.weight,
        risk: risk ? {
          stopLossPercent: risk.stopLossPercent,
          takeProfitPercent: risk.takeProfitPercent,
          maxConsecutiveLosses: risk.maxConsecutiveLosses,
        } : null,
        adaptive: adaptive ? {
          minConfidence: adaptive.min_confidence,
          winPatternCount: adaptive.win_pattern_count,
          lossPatternCount: adaptive.loss_pattern_count,
          lastAnalyzedAt: adaptive.last_analyzed_at,
        } : null,
        lessons: lesson ? {
          total: lesson.total,
          wins: lesson.wins,
          losses: lesson.losses,
          winRate: lesson.total > 0 ? (lesson.wins / lesson.total) * 100 : 0,
          avgPnl: lesson.avgPnl,
          avgPnlPercent: lesson.avgPnlPercent,
          avgHoldMinutes: lesson.avgHoldDuration / 60000,
          bestTrade: lesson.bestTrade,
          worstTrade: lesson.worstTrade,
        } : null,
        recentLessons: recent.map((r) => ({
          pnl: r.pnl,
          pnlPercent: r.pnl_percent,
          holdMinutes: r.hold_duration / 60000,
          regime: r.market_regime,
          at: r.created_at,
        })),
        consecutiveLosses: consecutive,
      };
    });

    return NextResponse.json({ strategies, riskByCategory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
