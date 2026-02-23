import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class OrderBookImbalanceStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "orderbook-imbalance",
    name: "호가창 불균형",
    category: "order-flow",
    difficulty: "advanced",
    description: "매수벽이 매도벽의 2~3배 크면 가격 상승 기대 (캔들 데이터로 근사)",
    defaultParameters: { imbalanceRatio: 2.0, lookback: 5 },
    parameterRanges: {
      imbalanceRatio: { min: 1.5, max: 3.0, step: 0.5 },
      lookback: { min: 3, max: 10, step: 1 },
    },
    requiredIndicators: ["cvd"],
    recommendedTimeframes: ["1m", "3m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const cvd = this.calcIndicator("cvd", candles);
    const lookback = params.lookback ?? 5;
    const ratio = params.imbalanceRatio ?? 2.0;
    if (cvd.length < lookback + 1) return this.hold();

    // 최근 N개 캔들의 매수/매도 볼륨 비율로 호가창 불균형 근사
    let buyVol = 0, sellVol = 0;
    for (let i = candles.length - lookback; i < candles.length; i++) {
      const c = candles[i];
      const range = c.high - c.low;
      const buyRatio = range > 0 ? (c.close - c.low) / range : 0.5;
      buyVol += c.volume * buyRatio;
      sellVol += c.volume * (1 - buyRatio);
    }

    const imbalance = sellVol > 0 ? buyVol / sellVol : 1;
    const price = candles[candles.length - 1].close;
    const prevPrice = candles[candles.length - 2].close;
    const priceRising = price > prevPrice;
    const ind = { buyVol, sellVol, imbalance, priceRising: priceRising ? 1 : 0 };

    // 매수 불균형 + 가격 상승 시작
    if (imbalance > ratio && priceRising) {
      return this.signal("buy", 0.6 + Math.min((imbalance - ratio) / 5, 0.3), `매수벽 ${imbalance.toFixed(1)}x 우세 + 가격 상승`, ind);
    }
    // 매도 불균형
    const sellImbalance = buyVol > 0 ? sellVol / buyVol : 1;
    if (sellImbalance > ratio && !priceRising) {
      return this.signal("sell", 0.6 + Math.min((sellImbalance - ratio) / 5, 0.3), `매도벽 ${sellImbalance.toFixed(1)}x 우세 + 가격 하락`, ind);
    }
    return this.hold(ind);
  }
}
