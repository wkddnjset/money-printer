import type { OHLCV } from "@/types/candle";
import type { IndicatorResult } from "@/types/indicator";
import { BaseIndicator } from "./base";

// Ichimoku Cloud
export class IchimokuIndicator extends BaseIndicator {
  readonly id = "ichimoku";
  readonly category = "composite" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const tenkanPeriod = params.tenkanPeriod ?? 9;
    const kijunPeriod = params.kijunPeriod ?? 26;
    const senkouBPeriod = params.senkouBPeriod ?? 52;

    const highLow = (start: number, end: number) => {
      let hi = -Infinity, lo = Infinity;
      for (let i = start; i < end; i++) {
        if (candles[i].high > hi) hi = candles[i].high;
        if (candles[i].low < lo) lo = candles[i].low;
      }
      return (hi + lo) / 2;
    };

    const results: IndicatorResult[] = [];
    const startIdx = Math.max(tenkanPeriod, kijunPeriod, senkouBPeriod);

    for (let i = startIdx; i < candles.length; i++) {
      const tenkan = highLow(i - tenkanPeriod, i);
      const kijun = highLow(i - kijunPeriod, i);
      const senkouA = (tenkan + kijun) / 2;
      const senkouB = highLow(i - senkouBPeriod, i);

      results.push({
        indicatorId: this.id,
        timestamp: candles[i].timestamp,
        values: {
          tenkan, kijun, senkouA, senkouB,
          cloudTop: Math.max(senkouA, senkouB),
          cloudBottom: Math.min(senkouA, senkouB),
        },
      });
    }
    return results;
  }
}
