import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class VolumeProfileStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "volume-profile",
    name: "Volume Profile 회귀",
    category: "mean-reversion",
    difficulty: "advanced",
    description: "거래량이 많이 몰린 가격대(POC)에서 지지/저항을 감지하고, VAH/VAL에서 반등을 노린다",
    defaultParameters: { vpPeriod: 50, rsiPeriod: 14 },
    parameterRanges: {
      vpPeriod: { min: 30, max: 100, step: 10 },
      rsiPeriod: { min: 7, max: 21, step: 1 },
    },
    requiredIndicators: ["volumeprofile", "rsi"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const vp = this.calcIndicator("volumeprofile", candles, { period: params.vpPeriod ?? 50 });
    const rsi = this.calcIndicator("rsi", candles, { period: params.rsiPeriod ?? 14 });
    if (vp.length < 2 || rsi.length < 3) return this.hold();

    const v = this.latest(vp);
    const r = this.latest(rsi);
    const rPrev = this.prev(rsi, 2);
    const price = candles[candles.length - 1].close;
    const ind = { poc: v.poc, vah: v.vah, val: v.val, rsi: r.value, price };

    // 가격이 VAL(하단) 근처 + RSI 상승 다이버전스 → 매수
    const nearVAL = price <= v.val * 1.002;
    const rsiBullDiv = r.value > rPrev.value && price <= candles[candles.length - 3].close;
    if (nearVAL && rsiBullDiv) {
      return this.signal("buy", 0.65, `VAL(${v.val.toFixed(4)}) 터치 + RSI 상승 다이버전스`, ind);
    }

    const nearVAH = price >= v.vah * 0.998;
    const rsiBearDiv = r.value < rPrev.value && price >= candles[candles.length - 3].close;
    if (nearVAH && rsiBearDiv) {
      return this.signal("sell", 0.65, `VAH(${v.vah.toFixed(4)}) 터치 + RSI 하락 다이버전스`, ind);
    }
    return this.hold(ind);
  }
}
