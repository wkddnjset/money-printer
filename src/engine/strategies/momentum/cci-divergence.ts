import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class CCIDivergenceStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "cci-divergence",
    name: "CCI 다이버전스",
    category: "momentum",
    difficulty: "advanced",
    description: "가격은 새 저점인데 CCI는 더 높은 저점(강세 다이버전스) → 반등 매수",
    defaultParameters: { cciPeriod: 20, divergenceWindow: 10 },
    parameterRanges: {
      cciPeriod: { min: 14, max: 30, step: 2 },
      divergenceWindow: { min: 5, max: 20, step: 5 },
    },
    requiredIndicators: ["cci"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const cci = this.calcIndicator("cci", candles, { period: params.cciPeriod ?? 20 });
    const window = params.divergenceWindow ?? 10;
    if (cci.length < window + 5) return this.hold();

    const recent = cci.slice(-window);
    const recentCandles = candles.slice(-window);
    const cciNow = this.latest(cci).value;
    const priceNow = candles[candles.length - 1].close;
    const ind = { cci: cciNow, price: priceNow };

    // 윈도우 내 최저가 찾기
    let lowestPrice = Infinity, lowestCCI = Infinity, lowestIdx = 0;
    for (let i = 0; i < recent.length - 1; i++) {
      if (recentCandles[i].low < lowestPrice) {
        lowestPrice = recentCandles[i].low;
        lowestCCI = recent[i].values.value;
        lowestIdx = i;
      }
    }

    // 강세 다이버전스: 가격 새 저점 + CCI 높은 저점
    if (priceNow <= lowestPrice * 1.002 && cciNow > lowestCCI && cciNow > -100) {
      return this.signal("buy", 0.65, `CCI 강세 다이버전스 (가격↓ CCI↑) + CCI > -100`, ind);
    }

    // 윈도우 내 최고가 찾기
    let highestPrice = -Infinity, highestCCI = -Infinity;
    for (let i = 0; i < recent.length - 1; i++) {
      if (recentCandles[i].high > highestPrice) {
        highestPrice = recentCandles[i].high;
        highestCCI = recent[i].values.value;
      }
    }

    // 약세 다이버전스: 가격 새 고점 + CCI 낮은 고점
    if (priceNow >= highestPrice * 0.998 && cciNow < highestCCI && cciNow < 100) {
      return this.signal("sell", 0.65, `CCI 약세 다이버전스 (가격↑ CCI↓) + CCI < 100`, ind);
    }
    return this.hold(ind);
  }
}
