import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class WilliamsBBStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "williams-bb",
    name: "Williams %R + 볼린저밴드",
    category: "mean-reversion",
    difficulty: "intermediate",
    description: "Williams %R 과매도(-80 이하) + BB 하단 터치 + BB 폭 수축(스퀴즈) 시 폭발적 반등 기대",
    defaultParameters: { wrPeriod: 14, bbPeriod: 20, bbStdDev: 2 },
    parameterRanges: {
      wrPeriod: { min: 7, max: 21, step: 1 },
      bbPeriod: { min: 15, max: 25, step: 1 },
      bbStdDev: { min: 1.5, max: 2.5, step: 0.1 },
    },
    requiredIndicators: ["williamsr", "bb"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const wr = this.calcIndicator("williamsr", candles, { period: params.wrPeriod ?? 14 });
    const bb = this.calcIndicator("bb", candles, { period: params.bbPeriod ?? 20, stdDev: params.bbStdDev ?? 2 });
    if (wr.length < 2 || bb.length < 2) return this.hold();

    const w = this.latest(wr);
    const b = this.latest(bb);
    const bPrev = this.prev(bb, 5);
    const price = candles[candles.length - 1].close;
    const bbWidth = (b.upper - b.lower) / b.middle;
    const prevWidth = bPrev.middle ? (bPrev.upper - bPrev.lower) / bPrev.middle : bbWidth;
    const squeeze = bbWidth < prevWidth * 0.8;
    const ind = { williamsR: w.value, bbWidth, price, squeeze: squeeze ? 1 : 0 };

    // 스퀴즈 없이도 과매도/과매수 + BB 터치 시 발동 (1m 스캘핑 최적화)
    if (w.value < -75 && price <= b.lower) {
      const conf = squeeze ? 0.7 : 0.5;
      return this.signal("buy", conf, `Williams %R ${w.value.toFixed(1)} 과매도 + BB 하단${squeeze ? " + 스퀴즈" : ""}`, ind);
    }
    if (w.value > -25 && price >= b.upper) {
      const conf = squeeze ? 0.7 : 0.5;
      return this.signal("sell", conf, `Williams %R ${w.value.toFixed(1)} 과매수 + BB 상단${squeeze ? " + 스퀴즈" : ""}`, ind);
    }
    return this.hold(ind);
  }
}
