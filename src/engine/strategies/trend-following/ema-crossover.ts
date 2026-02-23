import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class EMACrossoverStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "ema-crossover",
    name: "EMA 크로스오버 (9/21)",
    category: "trend-following",
    difficulty: "beginner",
    description: "빠른 EMA(9)가 느린 EMA(21) 위로 올라가면 매수(골든크로스), 아래로 내려가면 매도(데드크로스)",
    defaultParameters: { fastPeriod: 5, slowPeriod: 13 },
    parameterRanges: {
      fastPeriod: { min: 3, max: 9, step: 1 },
      slowPeriod: { min: 10, max: 21, step: 1 },
    },
    requiredIndicators: ["ema"],
    recommendedTimeframes: ["1m", "5m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const fast = this.calcIndicator("ema", candles, { period: params.fastPeriod ?? 9 });
    const slow = this.calcIndicator("ema", candles, { period: params.slowPeriod ?? 21 });
    if (fast.length < 2 || slow.length < 2) return this.hold();

    const fNow = this.latest(fast).value;
    const fPrev = this.prev(fast).value;
    const sNow = this.latest(slow).value;
    const sPrev = this.prev(slow).value;
    const ind = { fastEMA: fNow, slowEMA: sNow };

    // 골든 크로스: fast가 slow 위로 교차
    if (fPrev <= sPrev && fNow > sNow) {
      const gap = (fNow - sNow) / sNow * 100;
      return this.signal("buy", 0.6 + Math.min(gap * 10, 0.3), `EMA 골든크로스 (${params.fastPeriod ?? 9}/${params.slowPeriod ?? 21})`, ind);
    }
    // 데드 크로스: fast가 slow 아래로 교차
    if (fPrev >= sPrev && fNow < sNow) {
      const gap = (sNow - fNow) / sNow * 100;
      return this.signal("sell", 0.6 + Math.min(gap * 10, 0.3), `EMA 데드크로스 (${params.fastPeriod ?? 9}/${params.slowPeriod ?? 21})`, ind);
    }
    return this.hold(ind);
  }
}
