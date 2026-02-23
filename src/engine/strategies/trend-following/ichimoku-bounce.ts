import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class IchimokuBounceStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "ichimoku-bounce",
    name: "이치모쿠 구름 바운스",
    category: "trend-following",
    difficulty: "advanced",
    description: "가격이 이치모쿠 구름 위에서 구름에 닿고 반등하면 매수 (텐칸>키준 확인)",
    defaultParameters: { tenkanPeriod: 9, kijunPeriod: 26, senkouBPeriod: 52 },
    parameterRanges: {
      tenkanPeriod: { min: 7, max: 12, step: 1 },
      kijunPeriod: { min: 20, max: 30, step: 1 },
      senkouBPeriod: { min: 40, max: 60, step: 2 },
    },
    requiredIndicators: ["ichimoku"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const ich = this.calcIndicator("ichimoku", candles, params);
    if (ich.length < 3) return this.hold();

    const now = this.latest(ich);
    const prev = this.prev(ich);
    const price = candles[candles.length - 1].close;
    const prevPrice = candles[candles.length - 2].close;
    const ind = { tenkan: now.tenkan, kijun: now.kijun, cloudTop: now.cloudTop, cloudBottom: now.cloudBottom, price };

    // 상승: 가격이 구름 위 + 구름 터치 후 반등 + 텐칸 > 키준
    if (price > now.cloudTop && prevPrice <= now.cloudTop * 1.005 && now.tenkan > now.kijun) {
      return this.signal("buy", 0.7, `구름 위 바운스 + 텐칸(${now.tenkan.toFixed(4)}) > 키준(${now.kijun.toFixed(4)})`, ind);
    }
    // 하락: 가격이 구름 아래 + 구름 터치 후 하락 + 텐칸 < 키준
    if (price < now.cloudBottom && prevPrice >= now.cloudBottom * 0.995 && now.tenkan < now.kijun) {
      return this.signal("sell", 0.7, `구름 아래 바운스 + 텐칸 < 키준`, ind);
    }
    return this.hold(ind);
  }
}
