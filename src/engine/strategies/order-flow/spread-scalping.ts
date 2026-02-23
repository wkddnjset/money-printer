import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class SpreadScalpingStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "spread-scalping",
    name: "스프레드 스캘핑 (마켓메이킹)",
    category: "order-flow",
    difficulty: "advanced",
    description: "캔들의 고가-저가 스프레드가 클 때 저가 매수/고가 매도 (캔들 기반 근사)",
    defaultParameters: { atrPeriod: 14, spreadThreshold: 1.5, exitMultiplier: 0.5 },
    parameterRanges: {
      atrPeriod: { min: 10, max: 20, step: 1 },
      spreadThreshold: { min: 1.0, max: 2.0, step: 0.1 },
      exitMultiplier: { min: 0.3, max: 0.7, step: 0.1 },
    },
    requiredIndicators: ["atr"],
    recommendedTimeframes: ["1m", "3m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const atr = this.calcIndicator("atr", candles, { period: params.atrPeriod ?? 14 });
    if (atr.length < 2) return this.hold();

    const atrVal = this.latest(atr).value;
    const c = candles[candles.length - 1];
    const spread = c.high - c.low;
    const spreadRatio = atrVal > 0 ? spread / atrVal : 0;
    const threshold = params.spreadThreshold ?? 1.5;
    const price = c.close;
    const midPrice = (c.high + c.low) / 2;
    const ind = { spread, atr: atrVal, spreadRatio, midPrice };

    // 스프레드가 ATR 대비 크고, 현재 가격이 스프레드 하단 근처 → 매수
    if (spreadRatio > threshold && price < midPrice - spread * 0.2) {
      return this.signal("buy", 0.55, `넓은 스프레드(${spreadRatio.toFixed(1)}x ATR) + 하단 위치`, ind);
    }
    // 스프레드가 크고, 현재 가격이 스프레드 상단 근처 → 매도
    if (spreadRatio > threshold && price > midPrice + spread * 0.2) {
      return this.signal("sell", 0.55, `넓은 스프레드(${spreadRatio.toFixed(1)}x ATR) + 상단 위치`, ind);
    }
    return this.hold(ind);
  }
}
