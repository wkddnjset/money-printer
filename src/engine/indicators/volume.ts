import { OBV } from "technicalindicators";
import type { OHLCV } from "@/types/candle";
import type { IndicatorResult } from "@/types/indicator";
import { BaseIndicator } from "./base";

// VWAP - Volume Weighted Average Price
export class VWAPIndicator extends BaseIndicator {
  readonly id = "vwap";
  readonly category = "volume" as const;

  calculate(candles: OHLCV[], _params: Record<string, number>): IndicatorResult[] {
    let cumVol = 0, cumTP = 0;
    return candles.map((c) => {
      const tp = (c.high + c.low + c.close) / 3;
      cumVol += c.volume;
      cumTP += tp * c.volume;
      return {
        indicatorId: this.id,
        timestamp: c.timestamp,
        values: { value: cumVol > 0 ? cumTP / cumVol : tp },
      };
    });
  }
}

// OBV - On-Balance Volume
export class OBVIndicator extends BaseIndicator {
  readonly id = "obv";
  readonly category = "volume" as const;

  calculate(candles: OHLCV[], _params: Record<string, number>): IndicatorResult[] {
    const results = OBV.calculate({
      close: candles.map((c) => c.close),
      volume: candles.map((c) => c.volume),
    });
    const offset = candles.length - results.length;
    return results.map((r, i) => ({
      indicatorId: this.id,
      timestamp: candles[i + offset].timestamp,
      values: { value: r },
    }));
  }
}

// CMF - Chaikin Money Flow
export class CMFIndicator extends BaseIndicator {
  readonly id = "cmf";
  readonly category = "volume" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 20;
    const results: IndicatorResult[] = [];

    for (let i = period; i < candles.length; i++) {
      let sumMFV = 0, sumVol = 0;
      for (let j = i - period; j < i; j++) {
        const range = candles[j].high - candles[j].low;
        const mfm = range > 0 ? ((candles[j].close - candles[j].low) - (candles[j].high - candles[j].close)) / range : 0;
        sumMFV += mfm * candles[j].volume;
        sumVol += candles[j].volume;
      }
      results.push({
        indicatorId: this.id,
        timestamp: candles[i].timestamp,
        values: { value: sumVol > 0 ? sumMFV / sumVol : 0 },
      });
    }
    return results;
  }
}

// CVD - Cumulative Volume Delta (approximation using candle data)
export class CVDIndicator extends BaseIndicator {
  readonly id = "cvd";
  readonly category = "volume" as const;

  calculate(candles: OHLCV[], _params: Record<string, number>): IndicatorResult[] {
    let cumDelta = 0;
    return candles.map((c) => {
      // Approximate buy/sell volume from candle shape
      const range = c.high - c.low;
      const buyRatio = range > 0 ? (c.close - c.low) / range : 0.5;
      const buyVol = c.volume * buyRatio;
      const sellVol = c.volume * (1 - buyRatio);
      cumDelta += buyVol - sellVol;
      return {
        indicatorId: this.id,
        timestamp: c.timestamp,
        values: { value: cumDelta, delta: buyVol - sellVol },
      };
    });
  }
}

// Volume Profile - POC, VAH, VAL
export class VolumeProfileIndicator extends BaseIndicator {
  readonly id = "volumeprofile";
  readonly category = "volume" as const;

  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[] {
    const period = params.period ?? 50;
    const bins = params.bins ?? 20;
    const results: IndicatorResult[] = [];

    for (let i = period; i < candles.length; i++) {
      const slice = candles.slice(i - period, i);
      let minPrice = Infinity, maxPrice = -Infinity;
      for (const c of slice) {
        if (c.low < minPrice) minPrice = c.low;
        if (c.high > maxPrice) maxPrice = c.high;
      }

      const binSize = (maxPrice - minPrice) / bins;
      if (binSize <= 0) {
        results.push({ indicatorId: this.id, timestamp: candles[i].timestamp, values: { poc: candles[i].close, vah: candles[i].close, val: candles[i].close } });
        continue;
      }

      const volumeByBin = new Array(bins).fill(0);
      for (const c of slice) {
        const bin = Math.min(Math.floor((c.close - minPrice) / binSize), bins - 1);
        volumeByBin[bin] += c.volume;
      }

      // POC = bin with highest volume
      let pocBin = 0, maxVol = 0;
      for (let b = 0; b < bins; b++) {
        if (volumeByBin[b] > maxVol) { maxVol = volumeByBin[b]; pocBin = b; }
      }

      // VAH/VAL = range containing 70% of volume
      const totalVol = volumeByBin.reduce((a, b) => a + b, 0);
      const targetVol = totalVol * 0.7;
      let cumVol = volumeByBin[pocBin], lo = pocBin, hi = pocBin;
      while (cumVol < targetVol && (lo > 0 || hi < bins - 1)) {
        const loVol = lo > 0 ? volumeByBin[lo - 1] : 0;
        const hiVol = hi < bins - 1 ? volumeByBin[hi + 1] : 0;
        if (loVol >= hiVol && lo > 0) { lo--; cumVol += volumeByBin[lo]; }
        else if (hi < bins - 1) { hi++; cumVol += volumeByBin[hi]; }
        else break;
      }

      results.push({
        indicatorId: this.id,
        timestamp: candles[i].timestamp,
        values: {
          poc: minPrice + (pocBin + 0.5) * binSize,
          vah: minPrice + (hi + 1) * binSize,
          val: minPrice + lo * binSize,
        },
      });
    }
    return results;
  }
}
