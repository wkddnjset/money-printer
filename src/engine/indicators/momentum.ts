import { RSI, MACD, StochasticRSI, CCI, WilliamsR, EMA } from "technicalindicators";
import type { OHLCV } from "@/types/candle";
import type { IndicatorResult } from "@/types/indicator";
import { BaseIndicator } from "./base";

export class RSIIndicator extends BaseIndicator {
  readonly id = "rsi";
  readonly category = "momentum" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 14;
    const closes = candles.map((c) => c.close);
    const values = RSI.calculate({ values: closes, period });
    const offset = candles.length - values.length;
    return values.map((v, i) => ({
      indicatorId: this.id,
      timestamp: candles[i + offset].timestamp,
      values: { value: v },
    }));
  }
}

export class MACDIndicator extends BaseIndicator {
  readonly id = "macd";
  readonly category = "momentum" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const fastPeriod = params.fastPeriod ?? 12;
    const slowPeriod = params.slowPeriod ?? 26;
    const signalPeriod = params.signalPeriod ?? 9;
    const closes = candles.map((c) => c.close);
    const results = MACD.calculate({
      values: closes, fastPeriod, slowPeriod, signalPeriod,
      SimpleMAOscillator: false, SimpleMASignal: false,
    });
    const offset = candles.length - results.length;
    return results.map((r, i) => ({
      indicatorId: this.id,
      timestamp: candles[i + offset].timestamp,
      values: { macd: r.MACD ?? 0, signal: r.signal ?? 0, histogram: r.histogram ?? 0 },
    }));
  }
}

export class StochRSIIndicator extends BaseIndicator {
  readonly id = "stochrsi";
  readonly category = "momentum" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const rsiPeriod = params.rsiPeriod ?? 14;
    const stochPeriod = params.stochPeriod ?? 14;
    const kPeriod = params.kPeriod ?? 3;
    const dPeriod = params.dPeriod ?? 3;
    const closes = candles.map((c) => c.close);
    const results = StochasticRSI.calculate({
      values: closes, rsiPeriod, stochasticPeriod: stochPeriod, kPeriod, dPeriod,
    });
    const offset = candles.length - results.length;
    return results.map((r, i) => ({
      indicatorId: this.id,
      timestamp: candles[i + offset].timestamp,
      values: { k: r.k, d: r.d },
    }));
  }
}

export class CCIIndicator extends BaseIndicator {
  readonly id = "cci";
  readonly category = "momentum" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 20;
    const results = CCI.calculate({
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

export class WilliamsRIndicator extends BaseIndicator {
  readonly id = "williamsr";
  readonly category = "momentum" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 14;
    const results = WilliamsR.calculate({
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

// MFI - Money Flow Index (momentum+volume hybrid)
export class MFIIndicator extends BaseIndicator {
  readonly id = "mfi";
  readonly category = "momentum" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 14;
    // MFI manual calculation: typical price * volume, ratio of positive/negative money flow
    const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
    const mf = tp.map((t, i) => t * candles[i].volume);

    const values: number[] = [];
    for (let i = period; i < candles.length; i++) {
      let posMF = 0, negMF = 0;
      for (let j = i - period + 1; j <= i; j++) {
        if (tp[j] > tp[j - 1]) posMF += mf[j];
        else negMF += mf[j];
      }
      const mfRatio = negMF === 0 ? 100 : posMF / negMF;
      values.push(100 - 100 / (1 + mfRatio));
    }

    const offset = candles.length - values.length;
    return values.map((v, i) => ({
      indicatorId: this.id,
      timestamp: candles[i + offset].timestamp,
      values: { value: v },
    }));
  }
}

// Elder Ray - Bull/Bear Power
export class ElderRayIndicator extends BaseIndicator {
  readonly id = "elderray";
  readonly category = "momentum" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 13;
    const closes = candles.map((c) => c.close);
    const emaValues = EMA.calculate({ values: closes, period });
    const offset = candles.length - emaValues.length;

    return emaValues.map((ema, i) => {
      const idx = i + offset;
      return {
        indicatorId: this.id,
        timestamp: candles[idx].timestamp,
        values: {
          bullPower: candles[idx].high - ema,
          bearPower: candles[idx].low - ema,
        },
      };
    });
  }
}
