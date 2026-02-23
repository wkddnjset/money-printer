import type { OHLCV } from "@/types/candle";
import type { StrategySignal, SignalAction } from "@/types/strategy";
import type { AggregatedSignal } from "@/types/signal";
import { getAllStrategies } from "@/engine/strategies";
import { getDb } from "@/lib/db";

interface StrategyWeight {
  strategyId: string;
  enabled: boolean;
  weight: number;
  parameters: Record<string, number>;
}

// DB에서 전략 가중치/활성 상태 로드
function loadWeights(): Map<string, StrategyWeight> {
  const db = getDb();
  const rows = db.prepare("SELECT strategy_id, enabled, weight, parameters FROM strategy_configs").all() as {
    strategy_id: string; enabled: number; weight: number; parameters: string;
  }[];

  const map = new Map<string, StrategyWeight>();
  for (const row of rows) {
    map.set(row.strategy_id, {
      strategyId: row.strategy_id,
      enabled: row.enabled === 1,
      weight: row.weight,
      parameters: JSON.parse(row.parameters),
    });
  }
  return map;
}

// DB에 기본 전략 설정 삽입 (없으면)
export function initStrategyConfigs(): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO strategy_configs (strategy_id, name, category, difficulty, enabled, weight, parameters, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const s of getAllStrategies()) {
      const c = s.config;
      insert.run(
        c.id, c.name, c.category, c.difficulty,
        1, // 기본 활성화
        1.0, // 기본 가중치
        JSON.stringify(c.defaultParameters),
        c.description,
      );
    }
  });
  tx();
}

// 20개 전략 신호를 가중 합산하여 최종 결정
export function aggregateSignals(candles: OHLCV[]): AggregatedSignal {
  const strategies = getAllStrategies();
  const weights = loadWeights();

  // 기본 설정이 없으면 초기화
  if (weights.size === 0) {
    initStrategyConfigs();
    return aggregateSignals(candles);
  }

  const signals: StrategySignal[] = [];
  let buyScore = 0;
  let sellScore = 0;
  let totalWeight = 0;

  for (const strategy of strategies) {
    const w = weights.get(strategy.config.id);
    if (!w || !w.enabled) continue;

    try {
      const signal = strategy.analyze(candles, w.parameters);
      signals.push(signal);

      const score = signal.confidence * w.weight;
      totalWeight += w.weight;

      if (signal.action === "buy") buyScore += score;
      else if (signal.action === "sell") sellScore += score;
    } catch {
      // 개별 전략 에러는 무시하고 계속 진행
    }
  }

  // 합산 로직
  // 1. buyScore > sellScore × 1.2 → 'buy'
  // 2. sellScore > buyScore × 1.2 → 'sell'
  // 3. 그 외 → 'hold'
  // 4. 최소 2개 이상의 전략이 같은 방향일 때만 실행
  const buyCount = signals.filter((s) => s.action === "buy").length;
  const sellCount = signals.filter((s) => s.action === "sell").length;

  let finalAction: SignalAction = "hold";
  if (buyScore > sellScore * 1.2 && buyCount >= 2) {
    finalAction = "buy";
  } else if (sellScore > buyScore * 1.2 && sellCount >= 2) {
    finalAction = "sell";
  }

  return {
    finalAction,
    buyScore,
    sellScore,
    totalWeight,
    strategySignals: signals,
    timestamp: Date.now(),
  };
}
