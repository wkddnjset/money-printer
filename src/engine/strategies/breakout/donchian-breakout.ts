import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class DonchianBreakoutStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "donchian-breakout",
    name: "돈치안 채널 돌파 + 거래량",
    category: "breakout",
    difficulty: "beginner",
    description: "최근 N개 캔들의 최고가를 돌파 + 평균 거래량의 2배 이상이면 매수",
    defaultParameters: { period: 20, volumeMultiplier: 2.0 },
    parameterRanges: {
      period: { min: 10, max: 30, step: 5 },
      volumeMultiplier: { min: 1.5, max: 3.0, step: 0.5 },
    },
    requiredIndicators: ["donchian"],
    recommendedTimeframes: ["3m", "5m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const dc = this.calcIndicator("donchian", candles, { period: params.period ?? 20 });
    if (dc.length < 2) return this.hold();

    const d = this.latest(dc);
    const dPrev = this.prev(dc);
    const price = candles[candles.length - 1].close;
    const vol = candles[candles.length - 1].volume;
    const avgVol = this.avgVolume(candles, 20);
    const volMul = params.volumeMultiplier ?? 2.0;
    const ind = { dcUpper: d.upper, dcLower: d.lower, price, volRatio: vol / avgVol };

    // 이전에는 채널 안에 있었는데 지금 상단 돌파 + 거래량
    if (candles[candles.length - 2].close <= dPrev.upper && price > d.upper && vol > avgVol * volMul) {
      return this.signal("buy", 0.65, `돈치안 상단(${d.upper.toFixed(4)}) 돌파 + 거래량 ${(vol / avgVol).toFixed(1)}x`, ind);
    }
    if (candles[candles.length - 2].close >= dPrev.lower && price < d.lower && vol > avgVol * volMul) {
      return this.signal("sell", 0.65, `돈치안 하단(${d.lower.toFixed(4)}) 붕괴 + 거래량`, ind);
    }
    return this.hold(ind);
  }
}
