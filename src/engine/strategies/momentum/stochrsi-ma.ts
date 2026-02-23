import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class StochRSIMAStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "stochrsi-ma",
    name: "Stochastic RSI + MA",
    category: "momentum",
    difficulty: "beginner",
    description: "StochRSI가 0.2 위로 올라가고 가격이 21 EMA 위에 있으면 매수",
    defaultParameters: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3, emaPeriod: 21 },
    parameterRanges: {
      rsiPeriod: { min: 7, max: 21, step: 1 },
      emaPeriod: { min: 9, max: 21, step: 1 },
    },
    requiredIndicators: ["stochrsi", "ema"],
    recommendedTimeframes: ["1m", "5m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const stoch = this.calcIndicator("stochrsi", candles, {
      rsiPeriod: params.rsiPeriod ?? 14, stochPeriod: params.stochPeriod ?? 14,
      kPeriod: params.kPeriod ?? 3, dPeriod: params.dPeriod ?? 3,
    });
    const ema = this.calcIndicator("ema", candles, { period: params.emaPeriod ?? 21 });
    if (stoch.length < 2 || ema.length < 1) return this.hold();

    const sNow = this.latest(stoch);
    const sPrev = this.prev(stoch);
    const e = this.latest(ema);
    const price = candles[candles.length - 1].close;
    const ind = { stochK: sNow.k, stochD: sNow.d, ema: e.value, price };

    // StochRSI 0.2 상향 크로스 + 가격 > EMA
    if (sPrev.k < 20 && sNow.k >= 20 && price > e.value) {
      return this.signal("buy", 0.65, `StochRSI 20 돌파 + 가격 > EMA(${(params.emaPeriod ?? 21)})`, ind);
    }
    // StochRSI 0.8 하향 크로스 + 가격 < EMA
    if (sPrev.k > 80 && sNow.k <= 80 && price < e.value) {
      return this.signal("sell", 0.65, `StochRSI 80 하향 + 가격 < EMA`, ind);
    }
    return this.hold(ind);
  }
}
