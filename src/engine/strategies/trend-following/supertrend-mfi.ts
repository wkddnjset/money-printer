import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class SuperTrendMFIStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "supertrend-mfi",
    name: "SuperTrend + MFI",
    category: "trend-following",
    difficulty: "beginner",
    description: "SuperTrend가 초록색(상승)으로 바뀌고 MFI가 30 위로 올라가면 매수",
    defaultParameters: { stPeriod: 10, stMultiplier: 3, mfiPeriod: 14 },
    parameterRanges: {
      stPeriod: { min: 7, max: 14, step: 1 },
      stMultiplier: { min: 2, max: 4, step: 0.5 },
      mfiPeriod: { min: 10, max: 20, step: 1 },
    },
    requiredIndicators: ["supertrend", "mfi"],
    recommendedTimeframes: ["3m", "5m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const st = this.calcIndicator("supertrend", candles, { period: params.stPeriod ?? 10, multiplier: params.stMultiplier ?? 3 });
    const mfi = this.calcIndicator("mfi", candles, { period: params.mfiPeriod ?? 14 });
    if (st.length < 2 || mfi.length < 2) return this.hold();

    const stNow = this.latest(st);
    const stPrev = this.prev(st);
    const m = this.latest(mfi);
    const mPrev = this.prev(mfi);
    const ind = { stDirection: stNow.direction, mfi: m.value };

    // SuperTrend 방향 전환 + MFI 크로스
    if (stPrev.direction <= 0 && stNow.direction > 0 && m.value > 30) {
      return this.signal("buy", 0.7, `SuperTrend 상승 전환 + MFI ${m.value.toFixed(1)}`, ind);
    }
    if (stPrev.direction >= 0 && stNow.direction < 0 && m.value < 70) {
      return this.signal("sell", 0.7, `SuperTrend 하락 전환 + MFI ${m.value.toFixed(1)}`, ind);
    }
    // MFI 크로스 (ST 방향과 일치할 때)
    if (stNow.direction > 0 && mPrev.value < 30 && m.value >= 30) {
      return this.signal("buy", 0.55, `상승 추세 + MFI 30 돌파`, ind);
    }
    if (stNow.direction < 0 && mPrev.value > 70 && m.value <= 70) {
      return this.signal("sell", 0.55, `하락 추세 + MFI 70 하향`, ind);
    }
    return this.hold(ind);
  }
}
