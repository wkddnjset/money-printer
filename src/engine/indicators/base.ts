import type { OHLCV } from "@/types/candle";
import type { Indicator, IndicatorCategory, IndicatorResult } from "@/types/indicator";

export abstract class BaseIndicator implements Indicator {
  abstract readonly id: string;
  abstract readonly category: IndicatorCategory;
  abstract calculate(
    candles: OHLCV[],
    params: Record<string, number>
  ): IndicatorResult[];
}
