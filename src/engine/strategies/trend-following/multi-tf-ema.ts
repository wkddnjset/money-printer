import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class MultiTFEMAStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "multi-tf-ema",
    name: "멀티 타임프레임 EMA 정렬",
    category: "trend-following",
    difficulty: "intermediate",
    description: "3개 EMA(9/21/50)가 순서대로 정렬되면 강한 추세 확인, 5분봉 EMA 크로스로 진입",
    defaultParameters: { fastEMA: 9, midEMA: 21, slowEMA: 50 },
    parameterRanges: {
      fastEMA: { min: 5, max: 12, step: 1 },
      midEMA: { min: 15, max: 30, step: 1 },
      slowEMA: { min: 40, max: 60, step: 5 },
    },
    requiredIndicators: ["ema"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const fast = this.calcIndicator("ema", candles, { period: params.fastEMA ?? 9 });
    const mid = this.calcIndicator("ema", candles, { period: params.midEMA ?? 21 });
    const slow = this.calcIndicator("ema", candles, { period: params.slowEMA ?? 50 });
    if (fast.length < 2 || mid.length < 2 || slow.length < 2) return this.hold();

    const f = this.latest(fast).value;
    const m = this.latest(mid).value;
    const s = this.latest(slow).value;
    const fPrev = this.prev(fast).value;
    const mPrev = this.prev(mid).value;
    const ind = { ema9: f, ema21: m, ema50: s };

    // 상승 정렬: 9 > 21 > 50
    if (f > m && m > s) {
      // 5m EMA 크로스 확인
      if (fPrev <= mPrev && f > m) {
        return this.signal("buy", 0.75, `EMA 상승 정렬(9>21>50) + 크로스 확인`, ind);
      }
      // 이미 정렬 상태에서 지속
      return this.signal("buy", 0.45, `EMA 상승 정렬 유지`, ind);
    }
    // 하락 정렬: 9 < 21 < 50
    if (f < m && m < s) {
      if (fPrev >= mPrev && f < m) {
        return this.signal("sell", 0.75, `EMA 하락 정렬(9<21<50) + 크로스 확인`, ind);
      }
      return this.signal("sell", 0.45, `EMA 하락 정렬 유지`, ind);
    }
    return this.hold(ind);
  }
}
