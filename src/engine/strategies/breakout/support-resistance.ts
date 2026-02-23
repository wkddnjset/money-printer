import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class SupportResistanceStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "support-resistance",
    name: "지지/저항 돌파",
    category: "breakout",
    difficulty: "intermediate",
    description: "최근 고가(저항)를 거래량 증가와 함께 돌파하면 매수, 저가(지지)를 깨면 매도",
    defaultParameters: { lookback: 30, volumeMultiplier: 1.5, confirmCandles: 1 },
    parameterRanges: {
      lookback: { min: 15, max: 60, step: 5 },
      volumeMultiplier: { min: 1.0, max: 2.5, step: 0.25 },
      confirmCandles: { min: 1, max: 3, step: 1 },
    },
    requiredIndicators: ["atr"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const lookback = params.lookback ?? 50;
    const volMul = params.volumeMultiplier ?? 2.0;
    if (candles.length < lookback + 5) return this.hold();

    const recent = candles.slice(-lookback, -1);
    const current = candles[candles.length - 1];
    const avgVol = this.avgVolume(candles, 20);

    let resistance = -Infinity, support = Infinity;
    for (const c of recent) {
      if (c.high > resistance) resistance = c.high;
      if (c.low < support) support = c.low;
    }

    const ind = { resistance, support, price: current.close, volumeRatio: current.volume / avgVol };

    // 저항 돌파 + 거래량 폭증
    if (current.close > resistance && current.volume > avgVol * volMul) {
      return this.signal("buy", 0.7, `저항(${resistance.toFixed(4)}) 돌파 + 거래량 ${(current.volume / avgVol).toFixed(1)}x`, ind);
    }
    // 지지 붕괴 + 거래량 폭증
    if (current.close < support && current.volume > avgVol * volMul) {
      return this.signal("sell", 0.7, `지지(${support.toFixed(4)}) 붕괴 + 거래량 ${(current.volume / avgVol).toFixed(1)}x`, ind);
    }
    return this.hold(ind);
  }
}
