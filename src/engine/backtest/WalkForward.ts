import type { OHLCV, Symbol, Timeframe } from "@/types/candle";
import type { WalkForwardConfig, WalkForwardResult, BacktestConfig } from "@/types/backtest";
import { runBacktest } from "./BacktestEngine";

const DEFAULT_CONFIG: WalkForwardConfig = {
  inSampleRatio: 0.7,
  outSampleRatio: 0.3,
  minPassRatio: 0.5,
};

/**
 * 워크포워드 검증
 * 데이터를 학습(In-Sample)과 검증(Out-of-Sample)으로 나누어
 * 과적합 여부를 판단
 *
 * 예: 7일 데이터
 *   - 학습: 5일 → 최적 파라미터 찾기
 *   - 검증: 2일 → 검증 수익률 ≥ 학습 수익률의 50% → PASS
 */
export function walkForwardValidation(
  strategyId: string,
  parameters: Record<string, number>,
  candles: OHLCV[],
  symbol: Symbol,
  timeframe: Timeframe,
  config: WalkForwardConfig = DEFAULT_CONFIG,
): WalkForwardResult {
  if (candles.length < 100) {
    return {
      strategyId,
      passed: false,
      inSampleReturn: 0,
      outSampleReturn: 0,
      passRatio: 0,
      parameters,
    };
  }

  // 데이터 분할
  const splitIdx = Math.floor(candles.length * config.inSampleRatio);
  const inSampleCandles = candles.slice(0, splitIdx);
  const outSampleCandles = candles.slice(splitIdx);

  if (inSampleCandles.length < 50 || outSampleCandles.length < 20) {
    return {
      strategyId,
      passed: false,
      inSampleReturn: 0,
      outSampleReturn: 0,
      passRatio: 0,
      parameters,
    };
  }

  // In-Sample 백테스트
  const inSampleConfig: BacktestConfig = {
    strategyId,
    symbol,
    timeframe,
    startTime: inSampleCandles[0].timestamp,
    endTime: inSampleCandles[inSampleCandles.length - 1].timestamp,
    parameters,
    initialBalance: 10000,
    feeRate: 0.001,
    slippageRate: 0.0005,
  };
  const inSampleResult = runBacktest(inSampleConfig, inSampleCandles);

  // Out-of-Sample 백테스트
  const outSampleConfig: BacktestConfig = {
    strategyId,
    symbol,
    timeframe,
    startTime: outSampleCandles[0].timestamp,
    endTime: outSampleCandles[outSampleCandles.length - 1].timestamp,
    parameters,
    initialBalance: 10000,
    feeRate: 0.001,
    slippageRate: 0.0005,
  };
  const outSampleResult = runBacktest(outSampleConfig, outSampleCandles);

  // 통과 판정
  const passRatio = inSampleResult.totalReturn > 0
    ? outSampleResult.totalReturn / inSampleResult.totalReturn
    : 0;
  const passed = passRatio >= config.minPassRatio && outSampleResult.totalReturn > 0;

  return {
    strategyId,
    passed,
    inSampleReturn: inSampleResult.totalReturn,
    outSampleReturn: outSampleResult.totalReturn,
    passRatio,
    parameters,
  };
}
