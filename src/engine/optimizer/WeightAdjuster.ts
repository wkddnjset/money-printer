import { getDb } from "@/lib/db";
import { detectRegime } from "./RegimeDetector";
import { getStrategiesByCategory } from "@/engine/strategies";
import type { OHLCV } from "@/types/candle";
import type { RegimeAnalysis } from "@/types/backtest";

interface AdjustmentResult {
  regime: RegimeAnalysis;
  adjustments: { strategyId: string; oldWeight: number; newWeight: number; reason: string }[];
  conservativeMode: boolean;
}

/**
 * 실시간 가중치 조정
 *
 * 1. 시장 국면에 맞는 전략 카테고리 가중치 부여
 * 2. 최근 20거래 승률 기반 보수적 모드 전환
 * 3. 성과 부진 전략 가중치 감소
 */
export function adjustWeights(candles: OHLCV[]): AdjustmentResult {
  const regime = detectRegime(candles);
  const db = getDb();
  const adjustments: AdjustmentResult["adjustments"] = [];

  // 최근 20거래 승률 체크
  const recentTrades = db.prepare(`
    SELECT pnl FROM trades
    WHERE exit_at IS NOT NULL AND pnl IS NOT NULL
    ORDER BY exit_at DESC LIMIT 20
  `).all() as { pnl: number }[];

  const recentWinRate = recentTrades.length >= 5
    ? recentTrades.filter((t) => t.pnl > 0).length / recentTrades.length
    : 0.5;

  const conservativeMode = recentWinRate < 0.45 && recentTrades.length >= 10;

  // 현재 전략 설정 로드
  const configs = db.prepare(`
    SELECT strategy_id, category, weight, enabled FROM strategy_configs WHERE enabled = 1
  `).all() as { strategy_id: string; category: string; weight: number; enabled: number }[];

  // 국면별 카테고리 보너스
  const categoryBonus: Record<string, number> = {};
  for (const cat of regime.recommendedCategories) {
    categoryBonus[cat] = 1.3; // 추천 카테고리 30% 가중치 보너스
  }

  for (const config of configs) {
    let newWeight = config.weight;
    const reasons: string[] = [];

    // 국면 기반 조정
    const bonus = categoryBonus[config.category] ?? 0.8;
    if (bonus !== 1.0) {
      newWeight *= bonus;
      if (bonus > 1) {
        reasons.push(`${regime.regime} 시장에 적합 (+${((bonus - 1) * 100).toFixed(0)}%)`);
      } else {
        reasons.push(`${regime.regime} 시장에 부적합 (${((bonus - 1) * 100).toFixed(0)}%)`);
      }
    }

    // 보수적 모드: 전체 가중치 50% 감소
    if (conservativeMode) {
      newWeight *= 0.5;
      reasons.push(`보수적 모드 (최근 승률 ${(recentWinRate * 100).toFixed(0)}%)`);
    }

    // 범위 제한: 0.1 ~ 3.0
    newWeight = Math.max(0.1, Math.min(3.0, newWeight));

    if (Math.abs(newWeight - config.weight) > 0.05) {
      adjustments.push({
        strategyId: config.strategy_id,
        oldWeight: config.weight,
        newWeight,
        reason: reasons.join(", "),
      });

      db.prepare("UPDATE strategy_configs SET weight = ?, updated_at = ? WHERE strategy_id = ?")
        .run(newWeight, Date.now(), config.strategy_id);
    }
  }

  // 국면 상태 저장
  db.prepare("UPDATE engine_state SET value = ?, updated_at = ? WHERE key = 'current_regime'")
    .run(JSON.stringify({ regime: regime.regime, confidence: regime.confidence }), Date.now());

  return { regime, adjustments, conservativeMode };
}
