import { EMA, ADX, PSAR } from "technicalindicators";
import type { OHLCV } from "@/types/candle";
import type { IndicatorResult } from "@/types/indicator";
import { BaseIndicator } from "./base";

export class EMAIndicator extends BaseIndicator {
  readonly id = "ema";
  readonly category = "trend" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 9;
    const closes = candles.map((c) => c.close);
    const values = EMA.calculate({ values: closes, period });
    const offset = candles.length - values.length;
    return values.map((v, i) => ({
      indicatorId: `ema_${period}`,
      timestamp: candles[i + offset].timestamp,
      values: { value: v },
    }));
  }
}

export class ADXIndicator extends BaseIndicator {
  readonly id = "adx";
  readonly category = "trend" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 14;
    const results = ADX.calculate({
      close: candles.map((c) => c.close),
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      period,
    });
    const offset = candles.length - results.length;
    return results.map((r, i) => ({
      indicatorId: this.id,
      timestamp: candles[i + offset].timestamp,
      values: { adx: r.adx, pdi: r.pdi, mdi: r.mdi },
    }));
  }
}

export class PSARIndicator extends BaseIndicator {
  readonly id = "psar";
  readonly category = "trend" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const step = params.step ?? 0.02;
    const max = params.max ?? 0.2;
    const results = PSAR.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      step, max,
    });
    const offset = candles.length - results.length;
    return results.map((r, i) => ({
      indicatorId: this.id,
      timestamp: candles[i + offset].timestamp,
      values: { value: r },
    }));
  }
}

// SuperTrend = ATR-based trend. Up when price > supertrend line, down when below.
export class SuperTrendIndicator extends BaseIndicator {
  readonly id = "supertrend";
  readonly category = "trend" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 10;
    const multiplier = params.multiplier ?? 3;

    // Calculate ATR manually for SuperTrend
    const tr: number[] = [0];
    for (let i = 1; i < candles.length; i++) {
      tr.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close),
      ));
    }

    const atr: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (i < period) { atr.push(0); continue; }
      if (i === period) {
        let sum = 0;
        for (let j = 1; j <= period; j++) sum += tr[j];
        atr.push(sum / period);
      } else {
        atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
      }
    }

    const results: IndicatorResult[] = [];
    let upperBand = 0, lowerBand = 0, supertrend = 0, direction = 1;

    for (let i = period; i < candles.length; i++) {
      const hl2 = (candles[i].high + candles[i].low) / 2;
      const newUpper = hl2 + multiplier * atr[i];
      const newLower = hl2 - multiplier * atr[i];

      upperBand = (newUpper < upperBand || candles[i - 1].close > upperBand) ? newUpper : upperBand;
      lowerBand = (newLower > lowerBand || candles[i - 1].close < lowerBand) ? newLower : lowerBand;

      if (i === period) { upperBand = newUpper; lowerBand = newLower; }

      const prevDir = direction;
      if (candles[i].close > upperBand) direction = 1;
      else if (candles[i].close < lowerBand) direction = -1;

      supertrend = direction === 1 ? lowerBand : upperBand;

      results.push({
        indicatorId: this.id,
        timestamp: candles[i].timestamp,
        values: { value: supertrend, direction, upper: upperBand, lower: lowerBand },
      });
    }

    return results;
  }
}

// Donchian Channel
export class DonchianIndicator extends BaseIndicator {
  readonly id = "donchian";
  readonly category = "trend" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 20;
    const results: IndicatorResult[] = [];

    for (let i = period; i < candles.length; i++) {
      let highest = -Infinity, lowest = Infinity;
      for (let j = i - period; j < i; j++) {
        if (candles[j].high > highest) highest = candles[j].high;
        if (candles[j].low < lowest) lowest = candles[j].low;
      }
      results.push({
        indicatorId: this.id,
        timestamp: candles[i].timestamp,
        values: { upper: highest, lower: lowest, middle: (highest + lowest) / 2 },
      });
    }
    return results;
  }
}
