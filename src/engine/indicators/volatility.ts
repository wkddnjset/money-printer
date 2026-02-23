import { BollingerBands, ATR, EMA } from "technicalindicators";
import type { OHLCV } from "@/types/candle";
import type { IndicatorResult } from "@/types/indicator";
import { BaseIndicator } from "./base";

export class BollingerBandsIndicator extends BaseIndicator {
  readonly id = "bb";
  readonly category = "volatility" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 20;
    const stdDev = params.stdDev ?? 2;
    const closes = candles.map((c) => c.close);
    const results = BollingerBands.calculate({ values: closes, period, stdDev });
    const offset = candles.length - results.length;
    return results.map((r, i) => ({
      indicatorId: this.id,
      timestamp: candles[i + offset].timestamp,
      values: { upper: r.upper, middle: r.middle, lower: r.lower },
    }));
  }
}

export class ATRIndicator extends BaseIndicator {
  readonly id = "atr";
  readonly category = "volatility" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 14;
    const results = ATR.calculate({
      close: candles.map((c) => c.close),
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      period,
    });
    const offset = candles.length - results.length;
    return results.map((r, i) => ({
      indicatorId: this.id,
      timestamp: candles[i + offset].timestamp,
      values: { value: r },
    }));
  }
}

// Keltner Channel = EMA ± ATR * multiplier
export class KeltnerChannelIndicator extends BaseIndicator {
  readonly id = "keltner";
  readonly category = "volatility" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const emaPeriod = params.emaPeriod ?? 20;
    const atrPeriod = params.atrPeriod ?? 10;
    const multiplier = params.multiplier ?? 1.5;

    const closes = candles.map((c) => c.close);
    const emaValues = EMA.calculate({ values: closes, period: emaPeriod });
    const atrValues = ATR.calculate({
      close: closes, high: candles.map((c) => c.high), low: candles.map((c) => c.low),
      period: atrPeriod,
    });

    const emaOffset = candles.length - emaValues.length;
    const atrOffset = candles.length - atrValues.length;
    const startIdx = Math.max(emaOffset, atrOffset);

    const results: IndicatorResult[] = [];
    for (let i = startIdx; i < candles.length; i++) {
      const ema = emaValues[i - emaOffset];
      const atr = atrValues[i - atrOffset];
      if (ema === undefined || atr === undefined) continue;
      results.push({
        indicatorId: this.id,
        timestamp: candles[i].timestamp,
        values: { upper: ema + multiplier * atr, middle: ema, lower: ema - multiplier * atr },
      });
    }
    return results;
  }
}
