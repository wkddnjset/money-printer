import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class KeltnerBreakoutStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "keltner-breakout",
    name: "켈트너 채널 돌파",
    category: "breakout",
    difficulty: "intermediate",
    description: "가격이 켈트너 채널 상단을 돌파 + ADX > 25 + 거래량 150%이면 강한 돌파 매수",
    defaultParameters: { emaPeriod: 20, atrPeriod: 10, multiplier: 1.5, adxPeriod: 14, adxThreshold: 25 },
    parameterRanges: {
      emaPeriod: { min: 15, max: 25, step: 1 },
      atrPeriod: { min: 7, max: 14, step: 1 },
      multiplier: { min: 1.0, max: 2.0, step: 0.1 },
      adxThreshold: { min: 20, max: 30, step: 1 },
    },
    requiredIndicators: ["keltner", "adx"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const kc = this.calcIndicator("keltner", candles, {
      emaPeriod: params.emaPeriod ?? 20, atrPeriod: params.atrPeriod ?? 10, multiplier: params.multiplier ?? 1.5,
    });
    const adx = this.calcIndicator("adx", candles, { period: params.adxPeriod ?? 14 });
    if (kc.length < 2 || adx.length < 1) return this.hold();

    const k = this.latest(kc);
    const a = this.latest(adx);
    const price = candles[candles.length - 1].close;
    const vol = candles[candles.length - 1].volume;
    const avgVol = this.avgVolume(candles, 20);
    const threshold = params.adxThreshold ?? 25;
    const ind = { kcUpper: k.upper, kcLower: k.lower, adx: a.adx, price, volRatio: vol / avgVol };

    if (price > k.upper && a.adx > threshold && vol > avgVol * 1.5) {
      return this.signal("buy", 0.7, `켈트너 상단 돌파 + ADX ${a.adx.toFixed(1)} + 거래량 ${(vol / avgVol).toFixed(1)}x`, ind);
    }
    if (price < k.lower && a.adx > threshold && vol > avgVol * 1.5) {
      return this.signal("sell", 0.7, `켈트너 하단 돌파 + ADX ${a.adx.toFixed(1)} + 거래량`, ind);
    }
    return this.hold(ind);
  }
}
