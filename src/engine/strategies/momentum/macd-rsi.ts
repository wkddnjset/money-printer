import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class MACDRSIStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "macd-rsi",
    name: "MACD + RSI 복합",
    category: "momentum",
    difficulty: "beginner",
    description: "MACD 골든크로스 + RSI가 40 아래에서 상승하면 매수 (두 지표가 같은 방향)",
    defaultParameters: { macdFast: 8, macdSlow: 17, macdSignal: 9, rsiPeriod: 10 },
    parameterRanges: {
      macdFast: { min: 5, max: 12, step: 1 },
      macdSlow: { min: 13, max: 26, step: 1 },
      macdSignal: { min: 5, max: 9, step: 1 },
      rsiPeriod: { min: 7, max: 14, step: 1 },
    },
    requiredIndicators: ["macd", "rsi"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const macd = this.calcIndicator("macd", candles, {
      fastPeriod: params.macdFast ?? 12, slowPeriod: params.macdSlow ?? 26, signalPeriod: params.macdSignal ?? 9,
    });
    const rsi = this.calcIndicator("rsi", candles, { period: params.rsiPeriod ?? 14 });
    if (macd.length < 2 || rsi.length < 2) return this.hold();

    const mNow = this.latest(macd);
    const mPrev = this.prev(macd);
    const r = this.latest(rsi);
    const rPrev = this.prev(rsi);
    const ind = { macd: mNow.macd, macdSignal: mNow.signal, rsi: r.value };

    // MACD 골든크로스 + RSI 45 이하에서 상승 (1m 스캘핑: 완화)
    if (mPrev.macd <= mPrev.signal && mNow.macd > mNow.signal && r.value < 45 && r.value > rPrev.value) {
      return this.signal("buy", 0.6, `MACD 골든크로스 + RSI ${r.value.toFixed(1)} 상승 중`, ind);
    }
    // MACD 데드크로스 + RSI 55 이상에서 하락
    if (mPrev.macd >= mPrev.signal && mNow.macd < mNow.signal && r.value > 55 && r.value < rPrev.value) {
      return this.signal("sell", 0.6, `MACD 데드크로스 + RSI ${r.value.toFixed(1)} 하락 중`, ind);
    }
    return this.hold(ind);
  }
}
