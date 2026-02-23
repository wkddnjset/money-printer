import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class OBVDivergenceStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "obv-divergence",
    name: "OBV 다이버전스 + 캔들 패턴",
    category: "divergence",
    difficulty: "intermediate",
    description: "가격은 하락하는데 OBV(거래량 흐름)은 상승 → 곧 반등할 신호 + 해머/엔걸핑 캔들 확인",
    defaultParameters: { divergenceWindow: 10 },
    parameterRanges: {
      divergenceWindow: { min: 5, max: 20, step: 5 },
    },
    requiredIndicators: ["obv"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const obv = this.calcIndicator("obv", candles);
    const window = params.divergenceWindow ?? 10;
    if (obv.length < window + 2) return this.hold();

    const priceNow = candles[candles.length - 1].close;
    const priceStart = candles[candles.length - window].close;
    const obvNow = this.latest(obv).value;
    const obvStart = obv[obv.length - window]?.values.value ?? obvNow;
    const priceTrend = priceNow - priceStart;
    const obvTrend = obvNow - obvStart;

    const c = candles[candles.length - 1];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const isHammer = range > 0 && body / range < 0.3 && (c.close - c.low) / range > 0.6;
    const isBullEngulf = candles.length >= 2 &&
      candles[candles.length - 2].close < candles[candles.length - 2].open &&
      c.close > c.open && c.close > candles[candles.length - 2].open;

    const ind = { obvTrend, priceTrend, isHammer: isHammer ? 1 : 0, isBullEngulf: isBullEngulf ? 1 : 0 };

    // 강세 다이버전스: 가격↓ + OBV↑ + 캔들 확인
    if (priceTrend < 0 && obvTrend > 0 && (isHammer || isBullEngulf)) {
      return this.signal("buy", 0.7, `OBV 강세 다이버전스 + ${isHammer ? "해머" : "장악형"} 캔들`, ind);
    }

    const isShootingStar = range > 0 && body / range < 0.3 && (c.high - c.close) / range > 0.6;
    const isBearEngulf = candles.length >= 2 &&
      candles[candles.length - 2].close > candles[candles.length - 2].open &&
      c.close < c.open && c.close < candles[candles.length - 2].open;

    // 약세 다이버전스: 가격↑ + OBV↓ + 캔들 확인
    if (priceTrend > 0 && obvTrend < 0 && (isShootingStar || isBearEngulf)) {
      return this.signal("sell", 0.7, `OBV 약세 다이버전스 + ${isShootingStar ? "슈팅스타" : "장악형"} 캔들`, ind);
    }
    return this.hold(ind);
  }
}
