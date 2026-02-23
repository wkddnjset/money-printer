import type { OHLCV } from "@/types/candle";
import type { StrategyConfig, StrategySignal } from "@/types/strategy";
import { BaseStrategy } from "../base";

export class VWAPReversionStrategy extends BaseStrategy {
  readonly config: StrategyConfig = {
    id: "vwap-reversion",
    name: "VWAP 평균회귀",
    category: "mean-reversion",
    difficulty: "beginner",
    description: "가격이 VWAP(거래량 가중 평균가)에서 벗어났다가 돌아올 때를 노린다",
    defaultParameters: { deviationPct: 0.2, volumeMultiplier: 1.2 },
    parameterRanges: {
      deviationPct: { min: 0.1, max: 0.5, step: 0.05 },
      volumeMultiplier: { min: 1.0, max: 2.0, step: 0.1 },
    },
    requiredIndicators: ["vwap"],
    recommendedTimeframes: ["5m", "15m"],
  };

  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal {
    const vwap = this.calcIndicator("vwap", candles);
    if (vwap.length < 2) return this.hold();

    const v = this.latest(vwap);
    const price = candles[candles.length - 1].close;
    const vol = candles[candles.length - 1].volume;
    const avgVol = this.avgVolume(candles, 20);
    const devPct = params.deviationPct ?? 0.3;
    const volMul = params.volumeMultiplier ?? 1.5;
    const deviation = (price - v.value) / v.value * 100;
    const ind = { vwap: v.value, price, deviation, volumeRatio: vol / avgVol };

    // 가격이 VWAP 아래로 충분히 벌어졌고 거래량 증가 → 매수 (되돌림 기대)
    if (deviation < -devPct && vol > avgVol * volMul) {
      return this.signal("buy", 0.5 + Math.min(Math.abs(deviation) / 2, 0.4), `VWAP 대비 ${deviation.toFixed(2)}% 하방이탈 + 거래량 증가`, ind);
    }
    if (deviation > devPct && vol > avgVol * volMul) {
      return this.signal("sell", 0.5 + Math.min(deviation / 2, 0.4), `VWAP 대비 ${deviation.toFixed(2)}% 상방이탈 + 거래량 증가`, ind);
    }
    return this.hold(ind);
  }
}
