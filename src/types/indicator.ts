import type { OHLCV } from "./candle";

export type IndicatorCategory =
  | "trend"
  | "momentum"
  | "volatility"
  | "volume"
  | "composite";

export interface IndicatorConfig {
  id: string;
  category: IndicatorCategory;
  parameters: Record<string, number>;
}

export interface IndicatorResult {
  indicatorId: string;
  timestamp: number;
  values: Record<string, number>;
}

export interface Indicator {
  readonly id: string;
  readonly category: IndicatorCategory;
  calculate(
    candles: OHLCV[],
    params: Record<string, number>
  ): IndicatorResult[];
}
