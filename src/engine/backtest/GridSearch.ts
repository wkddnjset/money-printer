import type { OHLCV, Symbol, Timeframe } from "@/types/candle";
import type { GridSearchConfig, GridSearchResult, BacktestConfig } from "@/types/backtest";
import { runBacktest } from "./BacktestEngine";
import { getStrategy } from "@/engine/strategies";

const MAX_COMBINATIONS = 500;

/**
 * 그리드 탐색으로 최적 파라미터 찾기
 * parameterGrid의 모든 조합을 백테스트하여 최적 결과 반환
 */
export function gridSearch(
  config: GridSearchConfig,
  candles: OHLCV[],
  symbol: Symbol,
  timeframe: Timeframe,
): GridSearchResult {
  const strategy = getStrategy(config.strategyId);
  if (!strategy) {
    return {
      strategyId: config.strategyId,
      bestParams: {},
      bestScore: 0,
      optimizeFor: config.optimizeFor,
      testedCombinations: 0,
      topResults: [],
    };
  }

  // 파라미터 조합 생성
  const combinations = generateCombinations(config.parameterGrid);

  // 최대 500개로 제한 (균등 샘플링)
  const limited = combinations.length > MAX_COMBINATIONS
    ? sampleCombinations(combinations, MAX_COMBINATIONS)
    : combinations;

  const startTime = candles[0]?.timestamp ?? 0;
  const endTime = candles[candles.length - 1]?.timestamp ?? 0;

  // 모든 조합 백테스트
  const results: {
    params: Record<string, number>;
    score: number;
    winRate: number;
    totalReturn: number;
    sharpeRatio: number;
  }[] = [];

  for (const params of limited) {
    const btConfig: BacktestConfig = {
      strategyId: config.strategyId,
      symbol,
      timeframe,
      startTime,
      endTime,
      parameters: params,
      initialBalance: 10000,
      feeRate: 0.001,
      slippageRate: 0.0005,
    };

    const result = runBacktest(btConfig, candles);

    // 최소 거래 수 필터 (5건 이상)
    if (result.tradeCount < 5) continue;

    const score = getScore(result, config.optimizeFor);

    results.push({
      params,
      score,
      winRate: result.winRate,
      totalReturn: result.totalReturn,
      sharpeRatio: result.sharpeRatio,
    });
  }

  // 점수 내림차순 정렬
  results.sort((a, b) => b.score - a.score);

  const best = results[0];

  return {
    strategyId: config.strategyId,
    bestParams: best?.params ?? strategy.config.defaultParameters as Record<string, number>,
    bestScore: best?.score ?? 0,
    optimizeFor: config.optimizeFor,
    testedCombinations: limited.length,
    topResults: results.slice(0, 5),
  };
}

function getScore(
  result: { winRate: number; totalReturn: number; sharpeRatio: number },
  optimizeFor: string,
): number {
  switch (optimizeFor) {
    case "sharpe": return result.sharpeRatio;
    case "return": return result.totalReturn;
    case "winRate": return result.winRate;
    default: return result.sharpeRatio;
  }
}

/**
 * 파라미터 그리드의 모든 조합 생성
 * { a: [1, 2], b: [3, 4] } → [{ a: 1, b: 3 }, { a: 1, b: 4 }, { a: 2, b: 3 }, { a: 2, b: 4 }]
 */
function generateCombinations(grid: Record<string, number[]>): Record<string, number>[] {
  const keys = Object.keys(grid);
  if (keys.length === 0) return [{}];

  const results: Record<string, number>[] = [];

  function recurse(idx: number, current: Record<string, number>) {
    if (idx === keys.length) {
      results.push({ ...current });
      return;
    }
    const key = keys[idx];
    for (const val of grid[key]) {
      current[key] = val;
      recurse(idx + 1, current);
    }
  }

  recurse(0, {});
  return results;
}

/**
 * 균등 샘플링으로 조합 수 제한
 */
function sampleCombinations(
  combinations: Record<string, number>[],
  maxCount: number,
): Record<string, number>[] {
  if (combinations.length <= maxCount) return combinations;

  const step = combinations.length / maxCount;
  const sampled: Record<string, number>[] = [];

  for (let i = 0; i < maxCount; i++) {
    const idx = Math.min(Math.floor(i * step), combinations.length - 1);
    sampled.push(combinations[idx]);
  }

  return sampled;
}

/**
 * 전략의 parameterRanges에서 그리드 생성
 */
export function buildGridFromStrategy(strategyId: string): Record<string, number[]> {
  const strategy = getStrategy(strategyId);
  if (!strategy) return {};

  const grid: Record<string, number[]> = {};
  const ranges = strategy.config.parameterRanges;

  for (const [key, range] of Object.entries(ranges)) {
    const values: number[] = [];
    for (let v = range.min; v <= range.max; v += range.step) {
      values.push(Math.round(v * 1000) / 1000); // 부동소수점 오차 방지
    }
    grid[key] = values;
  }

  return grid;
}
