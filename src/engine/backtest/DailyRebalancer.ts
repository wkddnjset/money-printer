import { getDb } from "@/lib/db";
import { tradingConfig } from "@/lib/config";
import { fetchOHLCV } from "@/engine/ExchangeConnector";
import { getAllStrategies } from "@/engine/strategies";
import { runBacktest } from "./BacktestEngine";
import { gridSearch, buildGridFromStrategy } from "./GridSearch";
import { walkForwardValidation } from "./WalkForward";
import { detectRegime } from "@/engine/optimizer/RegimeDetector";
import type { BacktestConfig, BacktestResult } from "@/types/backtest";
import type { Symbol, Timeframe } from "@/types/candle";

interface RebalanceResult {
  timestamp: number;
  durationMs: number;
  strategiesUpdated: number;
  strategiesDisabled: number;
  strategiesEnabled: number;
  changes: RebalanceChange[];
}

interface RebalanceChange {
  strategyId: string;
  changeType: "parameter" | "weight" | "enabled" | "risk";
  oldValue: string;
  newValue: string;
  reason: string;
}

/**
 * 일일 리밸런싱 프로세스 (00:00 UTC)
 *
 * 1. 과거 7일 데이터 수집
 * 2. 각 전략 백테스트
 * 3. 그리드 탐색으로 최적 파라미터 찾기
 * 4. 워크포워드 검증
 * 5. 통과한 파라미터만 적용
 * 6. 가중치 조정
 * 7. 변경 이력 기록
 */
export async function runDailyRebalance(
  symbol: Symbol = tradingConfig.symbol,
  timeframe: Timeframe = tradingConfig.timeframe,
): Promise<RebalanceResult> {
  const startTime = Date.now();
  const changes: RebalanceChange[] = [];
  const db = getDb();

  // Step 1: 과거 7일 캔들 수집
  const candles = await fetchOHLCV(symbol, timeframe, 2000);
  if (candles.length < 200) {
    return {
      timestamp: startTime,
      durationMs: Date.now() - startTime,
      strategiesUpdated: 0,
      strategiesDisabled: 0,
      strategiesEnabled: 0,
      changes: [{ strategyId: "system", changeType: "risk", oldValue: "0", newValue: "0", reason: "캔들 데이터 부족" }],
    };
  }

  const strategies = getAllStrategies();
  let updated = 0;
  let disabled = 0;
  let enabled = 0;

  // Step 2 & 3 & 4: 각 전략별 백테스트 + 그리드탐색 + 워크포워드
  for (const strategy of strategies) {
    const sid = strategy.config.id;

    // 현재 파라미터로 백테스트
    const currentRow = db.prepare("SELECT parameters, weight, enabled FROM strategy_configs WHERE strategy_id = ?")
      .get(sid) as { parameters: string; weight: number; enabled: number } | undefined;

    const currentParams = currentRow
      ? JSON.parse(currentRow.parameters) as Record<string, number>
      : strategy.config.defaultParameters as Record<string, number>;
    const currentWeight = currentRow?.weight ?? 1.0;
    const isEnabled = currentRow?.enabled !== 0;

    // 현재 파라미터 백테스트
    const btConfig: BacktestConfig = {
      strategyId: sid,
      symbol,
      timeframe,
      startTime: candles[0].timestamp,
      endTime: candles[candles.length - 1].timestamp,
      parameters: currentParams,
      initialBalance: 10000,
      feeRate: 0.001,
      slippageRate: 0.0005,
    };
    const currentResult = runBacktest(btConfig, candles);

    // 그리드 탐색
    const grid = buildGridFromStrategy(sid);
    const gridResult = gridSearch(
      { strategyId: sid, parameterGrid: grid, optimizeFor: "sharpe" },
      candles, symbol, timeframe,
    );

    // 워크포워드 검증
    let newParams = currentParams;
    if (gridResult.bestScore > 0) {
      const wfResult = walkForwardValidation(
        sid, gridResult.bestParams, candles, symbol, timeframe,
      );

      if (wfResult.passed) {
        newParams = gridResult.bestParams;
        changes.push({
          strategyId: sid,
          changeType: "parameter",
          oldValue: JSON.stringify(currentParams),
          newValue: JSON.stringify(newParams),
          reason: `워크포워드 통과 (IS: ${wfResult.inSampleReturn.toFixed(1)}% → OS: ${wfResult.outSampleReturn.toFixed(1)}%)`,
        });
        updated++;
      }
    }

    // Step 5: 새 파라미터로 백테스트하여 가중치 결정
    const newBtConfig = { ...btConfig, parameters: newParams };
    const newResult = runBacktest(newBtConfig, candles);

    // 가중치 조정 (성과 기반)
    const newWeight = calculateWeight(newResult, currentWeight);
    if (Math.abs(newWeight - currentWeight) > 0.05) {
      changes.push({
        strategyId: sid,
        changeType: "weight",
        oldValue: currentWeight.toFixed(2),
        newValue: newWeight.toFixed(2),
        reason: `승률 ${(newResult.winRate * 100).toFixed(0)}%, 샤프 ${newResult.sharpeRatio.toFixed(2)}`,
      });
    }

    // Step 6: 활성/비활성 조정
    if (isEnabled && newResult.winRate < 0.35 && newResult.tradeCount >= 5) {
      // 승률 35% 미만 → 비활성화
      changes.push({
        strategyId: sid,
        changeType: "enabled",
        oldValue: "true",
        newValue: "false",
        reason: `승률 ${(newResult.winRate * 100).toFixed(0)}% < 35% 기준 미달`,
      });
      disabled++;

      db.prepare("UPDATE strategy_configs SET enabled = 0, weight = ?, parameters = ?, updated_at = ? WHERE strategy_id = ?")
        .run(newWeight, JSON.stringify(newParams), Date.now(), sid);
    } else if (!isEnabled && newResult.winRate > 0.55 && newResult.tradeCount >= 5) {
      // 비활성 상태에서 승률 55% 초과 → 재활성화
      changes.push({
        strategyId: sid,
        changeType: "enabled",
        oldValue: "false",
        newValue: "true",
        reason: `승률 ${(newResult.winRate * 100).toFixed(0)}% > 55%로 개선됨`,
      });
      enabled++;

      db.prepare("UPDATE strategy_configs SET enabled = 1, weight = ?, parameters = ?, updated_at = ? WHERE strategy_id = ?")
        .run(newWeight, JSON.stringify(newParams), Date.now(), sid);
    } else {
      // 일반 업데이트
      db.prepare("UPDATE strategy_configs SET weight = ?, parameters = ?, updated_at = ? WHERE strategy_id = ?")
        .run(newWeight, JSON.stringify(newParams), Date.now(), sid);
    }

    // 백테스트 결과 DB 저장
    saveBacktestResult(sid, timeframe, newResult, newParams);
  }

  // Step 7: 시장 국면 기반 리스크 조정
  const regime = detectRegime(candles);
  if (regime.regime === "volatile" && regime.confidence > 0.7) {
    changes.push({
      strategyId: "system",
      changeType: "risk",
      oldValue: JSON.stringify({ mode: "normal" }),
      newValue: JSON.stringify({ mode: "conservative", atrRatio: regime.indicators.atrRatio }),
      reason: `고변동성 시장 감지 (ATR 비율: ${regime.indicators.atrRatio.toFixed(1)}x)`,
    });
  }

  // 국면 상태 저장
  db.prepare("UPDATE engine_state SET value = ?, updated_at = ? WHERE key = 'current_regime'")
    .run(JSON.stringify({ regime: regime.regime, confidence: regime.confidence }), Date.now());

  // Step 8: 변경 이력 DB 기록
  const insertLog = db.prepare(`
    INSERT INTO rebalance_log (executed_at, strategy_id, change_type, old_value, new_value, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const txLog = db.transaction(() => {
    for (const c of changes) {
      insertLog.run(startTime, c.strategyId, c.changeType, c.oldValue, c.newValue, c.reason);
    }
  });
  txLog();

  return {
    timestamp: startTime,
    durationMs: Date.now() - startTime,
    strategiesUpdated: updated,
    strategiesDisabled: disabled,
    strategiesEnabled: enabled,
    changes,
  };
}

/**
 * 성과 기반 가중치 계산
 */
function calculateWeight(result: BacktestResult, currentWeight: number): number {
  if (result.tradeCount < 3) return currentWeight;

  // 복합 점수: 승률 40% + 샤프비율 30% + 수익률 30%
  const winScore = Math.min(result.winRate / 0.6, 1.5); // 60% → 1.0
  const sharpeScore = Math.min(Math.max(result.sharpeRatio, 0) / 1.5, 1.5); // 1.5 → 1.0
  const returnScore = Math.min(Math.max(result.totalReturn, 0) / 5.0, 1.5); // 5% → 1.0

  const compositeScore = winScore * 0.4 + sharpeScore * 0.3 + returnScore * 0.3;

  // 가중치 범위: 0.2 ~ 3.0
  const newWeight = Math.max(0.2, Math.min(3.0, compositeScore * 1.5));

  // 급격한 변동 방지: 현재 가중치와 새 가중치의 중간값
  return currentWeight * 0.3 + newWeight * 0.7;
}

/**
 * 백테스트 결과 DB 저장
 */
function saveBacktestResult(
  strategyId: string,
  timeframe: string,
  result: BacktestResult,
  parameters: Record<string, number>,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO backtest_results
      (strategy_id, timeframe, period_start, period_end, win_rate, total_return, max_drawdown, sharpe_ratio, trade_count, avg_trade_pnl, parameters)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    strategyId, timeframe,
    result.trades[0]?.entryTime ?? 0,
    result.trades[result.trades.length - 1]?.exitTime ?? 0,
    result.winRate, result.totalReturn, result.maxDrawdown, result.sharpeRatio,
    result.tradeCount, result.avgTradePnl,
    JSON.stringify(parameters),
  );
}
