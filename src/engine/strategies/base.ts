import type { OHLCV } from "@/types/candle";
import type { Strategy, StrategyConfig, StrategySignal, SignalAction } from "@/types/strategy";
import type { IndicatorResult } from "@/types/indicator";
import { getAllIndicators } from "@/engine/indicators";

export abstract class BaseStrategy implements Strategy {
  abstract readonly config: StrategyConfig;
  abstract analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal;

  // 헬퍼: 지표 계산
  protected calcIndicator(id: string, candles: OHLCV[], params: Record<string, number> = {}): IndicatorResult[] {
    const indicators = getAllIndicators();
    const ind = indicators.find((i) => i.id === id);
    if (!ind) return [];
    return ind.calculate(candles, params);
  }

  // 헬퍼: 최신 지표값
  protected latest(results: IndicatorResult[]): Record<string, number> {
    return results[results.length - 1]?.values ?? {};
  }

  // 헬퍼: N번째 전 지표값
  protected prev(results: IndicatorResult[], n: number = 1): Record<string, number> {
    const idx = results.length - 1 - n;
    return idx >= 0 ? results[idx].values : {};
  }

  // 헬퍼: 평균 거래량
  protected avgVolume(candles: OHLCV[], period: number = 20): number {
    const slice = candles.slice(-period);
    return slice.reduce((sum, c) => sum + c.volume, 0) / slice.length;
  }

  // 헬퍼: hold 신호 생성
  protected hold(indicators: Record<string, number> = {}): StrategySignal {
    return {
      action: "hold",
      confidence: 0,
      strategyId: this.config.id,
      reason: "조건 미충족",
      indicators,
      timestamp: Date.now(),
    };
  }

  // 헬퍼: 신호 생성
  protected signal(
    action: SignalAction,
    confidence: number,
    reason: string,
    indicators: Record<string, number> = {}
  ): StrategySignal {
    return {
      action,
      confidence: Math.min(Math.max(confidence, 0), 1),
      strategyId: this.config.id,
      reason,
      indicators,
      timestamp: Date.now(),
    };
  }
}
