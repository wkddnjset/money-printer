import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class RSIBBStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "rsi-bb",
    name: "RSI + 볼린저밴드",
    category: "mean-reversion",
    difficulty: "beginner",
    description: "RSI가 과매도(30 이하)이고 가격이 볼린저밴드 하단에 닿으면 매수, 과매수(70 이상)+상단이면 매도",
    defaultParameters: { rsiPeriod: 14, bbPeriod: 20, bbStdDev: 2 },
    parameterRanges: {
      rsiPeriod: { min: 7, max: 21, step: 1 },
      bbPeriod: { min: 15, max: 25, step: 1 },
      bbStdDev: { min: 1.5, max: 2.5, step: 0.1 },
    },
    requiredIndicators: ["rsi", "bb"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const rsi = this.calcIndicator("rsi", candles, { period: params.rsiPeriod ?? 14 });
    const bb = this.calcIndicator("bb", candles, { period: params.bbPeriod ?? 20, stdDev: params.bbStdDev ?? 2 });
    if (rsi.length < 2 || bb.length < 2) return this.hold();

    const r = this.latest(rsi);
    const b = this.latest(bb);
    const price = candles[candles.length - 1].close;
    const ind = { rsi: r.value, bbUpper: b.upper, bbLower: b.lower, price };

    // 1m 스캘핑: RSI 35/65로 완화 (1m에서 30/70은 너무 극단적)
    if (r.value < 35 && price <= b.lower) {
      return this.signal("buy", 0.5 + (35 - r.value) / 70, `RSI ${r.value.toFixed(1)} 과매도 + BB 하단 터치`, ind);
    }
    if (r.value > 65 && price >= b.upper) {
      return this.signal("sell", 0.5 + (r.value - 65) / 70, `RSI ${r.value.toFixed(1)} 과매수 + BB 상단 터치`, ind);
    }
    return this.hold(ind);
  }
}
