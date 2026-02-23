import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class HiddenDivergenceStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "hidden-divergence",
    name: "히든 다이버전스 추세 연속",
    category: "divergence",
    difficulty: "advanced",
    description: "상승 추세에서 가격은 더 높은 저점인데 RSI는 더 낮은 저점 → 추세 지속 매수",
    defaultParameters: { rsiPeriod: 14, divergenceWindow: 15 },
    parameterRanges: {
      rsiPeriod: { min: 10, max: 20, step: 1 },
      divergenceWindow: { min: 10, max: 25, step: 5 },
    },
    requiredIndicators: ["rsi", "ema"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const rsi = this.calcIndicator("rsi", candles, { period: params.rsiPeriod ?? 14 });
    const ema = this.calcIndicator("ema", candles, { period: 50 });
    const window = params.divergenceWindow ?? 15;
    if (rsi.length < window + 2 || ema.length < 2) return this.hold();

    const price = candles[candles.length - 1].close;
    const emaVal = this.latest(ema).value;
    const rsiNow = this.latest(rsi).value;

    // 윈도우 내에서 이전 저점/고점 찾기
    const rsiSlice = rsi.slice(-window, -1);
    const candleSlice = candles.slice(-window, -1);
    const ind = { rsi: rsiNow, price, ema50: emaVal };

    if (price > emaVal) {
      // 상승 추세에서 히든 강세 다이버전스
      let prevLowPrice = Infinity, prevLowRSI = Infinity;
      for (let i = 0; i < rsiSlice.length; i++) {
        if (candleSlice[i].low < prevLowPrice) {
          prevLowPrice = candleSlice[i].low;
          prevLowRSI = rsiSlice[i].values.value;
        }
      }
      // 가격: 더 높은 저점 + RSI: 더 낮은 저점
      if (candles[candles.length - 1].low > prevLowPrice && rsiNow < prevLowRSI) {
        return this.signal("buy", 0.7, `히든 강세 다이버전스: 가격↑저점 + RSI↓저점 → 추세 지속`, ind);
      }
    }

    if (price < emaVal) {
      // 하락 추세에서 히든 약세 다이버전스
      let prevHighPrice = -Infinity, prevHighRSI = -Infinity;
      for (let i = 0; i < rsiSlice.length; i++) {
        if (candleSlice[i].high > prevHighPrice) {
          prevHighPrice = candleSlice[i].high;
          prevHighRSI = rsiSlice[i].values.value;
        }
      }
      if (candles[candles.length - 1].high < prevHighPrice && rsiNow > prevHighRSI) {
        return this.signal("sell", 0.7, `히든 약세 다이버전스: 가격↓고점 + RSI↑고점 → 하락 지속`, ind);
      }
    }
    return this.hold(ind);
  }
}
