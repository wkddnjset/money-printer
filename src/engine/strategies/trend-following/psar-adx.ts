import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class PSARADXStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "psar-adx",
    name: "Parabolic SAR + ADX 필터",
    category: "trend-following",
    difficulty: "beginner",
    description: "SAR 점이 가격 아래로 이동(상승 전환) + ADX > 25(강한 추세)이면 매수",
    defaultParameters: { sarStep: 0.02, sarMax: 0.2, adxPeriod: 14, adxThreshold: 25 },
    parameterRanges: {
      sarStep: { min: 0.01, max: 0.03, step: 0.005 },
      sarMax: { min: 0.1, max: 0.3, step: 0.05 },
      adxPeriod: { min: 10, max: 20, step: 1 },
      adxThreshold: { min: 20, max: 30, step: 1 },
    },
    requiredIndicators: ["psar", "adx"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const psar = this.calcIndicator("psar", candles, { step: params.sarStep ?? 0.02, max: params.sarMax ?? 0.2 });
    const adx = this.calcIndicator("adx", candles, { period: params.adxPeriod ?? 14 });
    if (psar.length < 2 || adx.length < 1) return this.hold();

    const price = candles[candles.length - 1].close;
    const prevPrice = candles[candles.length - 2].close;
    const sarNow = this.latest(psar).value;
    const sarPrev = this.prev(psar).value;
    const adxVal = this.latest(adx).adx;
    const threshold = params.adxThreshold ?? 25;
    const ind = { psar: sarNow, adx: adxVal, price };

    // SAR이 가격 위→아래로 이동 (상승 전환) + ADX 충분
    if (sarPrev > prevPrice && sarNow < price && adxVal > threshold) {
      return this.signal("buy", 0.6 + Math.min((adxVal - threshold) / 50, 0.3), `SAR 상승 반전 + ADX ${adxVal.toFixed(1)}`, ind);
    }
    if (sarPrev < prevPrice && sarNow > price && adxVal > threshold) {
      return this.signal("sell", 0.6 + Math.min((adxVal - threshold) / 50, 0.3), `SAR 하락 반전 + ADX ${adxVal.toFixed(1)}`, ind);
    }
    return this.hold(ind);
  }
}
