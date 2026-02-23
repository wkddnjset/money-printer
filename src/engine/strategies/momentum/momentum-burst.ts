import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class MomentumBurstStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "momentum-burst",
    name: "모멘텀 버스트",
    category: "momentum",
    difficulty: "intermediate",
    description: "CVD(누적 거래량 델타) 급증 + RSI 50 상향 돌파 + 최근 고점 돌파 시 매수",
    defaultParameters: { rsiPeriod: 10, cvdThreshold: 1.5, lookback: 8 },
    parameterRanges: {
      rsiPeriod: { min: 7, max: 14, step: 1 },
      cvdThreshold: { min: 1.0, max: 2.5, step: 0.25 },
      lookback: { min: 5, max: 15, step: 1 },
    },
    requiredIndicators: ["cvd", "rsi"],
    recommendedTimeframes: ["1m", "3m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const cvd = this.calcIndicator("cvd", candles);
    const rsi = this.calcIndicator("rsi", candles, { period: params.rsiPeriod ?? 14 });
    if (cvd.length < 5 || rsi.length < 2) return this.hold();

    const cvdNow = this.latest(cvd);
    const cvdPrev = this.prev(cvd);
    const rNow = this.latest(rsi);
    const rPrev = this.prev(rsi);
    const price = candles[candles.length - 1].close;
    const lookback = params.lookback ?? 10;

    // 최근 N개 캔들의 최고가
    let recentHigh = -Infinity;
    for (let i = candles.length - lookback - 1; i < candles.length - 1; i++) {
      if (i >= 0 && candles[i].high > recentHigh) recentHigh = candles[i].high;
    }

    // CVD 평균 delta 대비 현재 spike
    const avgDelta = Math.abs(cvd.slice(-20).reduce((s, c) => s + Math.abs(c.values.delta), 0) / 20);
    const cvdSpike = avgDelta > 0 ? Math.abs(cvdNow.delta) / avgDelta : 0;
    const threshold = params.cvdThreshold ?? 2.0;
    const ind = { cvdSpike, rsi: rNow.value, price, recentHigh };

    // CVD 급증(매수) + RSI 50 상향 돌파 + 최근 고점 돌파
    if (cvdSpike > threshold && cvdNow.delta > 0 && rPrev.value < 50 && rNow.value >= 50 && price > recentHigh) {
      return this.signal("buy", 0.75, `CVD ${cvdSpike.toFixed(1)}x 급증 + RSI 50 돌파 + 고점 돌파`, ind);
    }
    // CVD 급감(매도) + RSI 50 하향
    if (cvdSpike > threshold && cvdNow.delta < 0 && rPrev.value > 50 && rNow.value <= 50) {
      return this.signal("sell", 0.65, `CVD 매도 급증 + RSI 50 하향`, ind);
    }
    return this.hold(ind);
  }
}
