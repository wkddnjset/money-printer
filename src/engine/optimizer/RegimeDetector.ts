import type { OHLCV } from "@/types/candle";
import type { RegimeAnalysis } from "@/types/backtest";
import { getIndicator } from "@/engine/indicators";

/**
 * 시장 국면 감지
 *
 * ADX > 25 + 방향성 → trending_up / trending_down
 * ADX < 20 + ATR 낮음 → ranging
 * ADX < 20 + ATR 높음 → volatile
 */
export function detectRegime(candles: OHLCV[]): RegimeAnalysis {
  if (candles.length < 50) {
    return {
      regime: "ranging",
      confidence: 0,
      indicators: { adx: 0, atr: 0, atrRatio: 1, trendDirection: 0 },
      recommendedCategories: ["mean-reversion"],
    };
  }

  // ADX 계산
  const adxIndicator = getIndicator("adx");
  const adxResults = adxIndicator?.calculate(candles, { period: 14 }) ?? [];
  const adxVal = adxResults.length > 0 ? adxResults[adxResults.length - 1].values.value : 20;

  // ATR 계산
  const atrIndicator = getIndicator("atr");
  const atrResults = atrIndicator?.calculate(candles, { period: 14 }) ?? [];
  const atrVal = atrResults.length > 0 ? atrResults[atrResults.length - 1].values.value : 0;

  // 평균 ATR (최근 50개 기준)
  const atrSlice = atrResults.slice(-50);
  const avgATR = atrSlice.length > 0
    ? atrSlice.reduce((s, r) => s + r.values.value, 0) / atrSlice.length
    : atrVal;
  const atrRatio = avgATR > 0 ? atrVal / avgATR : 1;

  // EMA로 추세 방향 판단
  const emaIndicator = getIndicator("ema");
  const ema21 = emaIndicator?.calculate(candles, { period: 21 }) ?? [];
  const ema50 = emaIndicator?.calculate(candles, { period: 50 }) ?? [];

  let trendDirection = 0;
  if (ema21.length > 0 && ema50.length > 0) {
    const ema21Val = ema21[ema21.length - 1].values.value;
    const ema50Val = ema50[ema50.length - 1].values.value;
    const price = candles[candles.length - 1].close;

    if (price > ema21Val && ema21Val > ema50Val) trendDirection = 1;
    else if (price < ema21Val && ema21Val < ema50Val) trendDirection = -1;
  }

  // 국면 결정
  let regime: RegimeAnalysis["regime"];
  let confidence: number;
  let recommendedCategories: string[];

  if (adxVal > 25) {
    if (trendDirection > 0) {
      regime = "trending_up";
      confidence = Math.min((adxVal - 20) / 30, 1);
      recommendedCategories = ["trend-following", "breakout", "momentum"];
    } else if (trendDirection < 0) {
      regime = "trending_down";
      confidence = Math.min((adxVal - 20) / 30, 1);
      recommendedCategories = ["trend-following", "divergence"];
    } else {
      regime = "ranging";
      confidence = 0.5;
      recommendedCategories = ["mean-reversion"];
    }
  } else if (atrRatio > 1.5) {
    regime = "volatile";
    confidence = Math.min((atrRatio - 1) / 2, 1);
    recommendedCategories = ["mean-reversion", "order-flow"];
  } else {
    regime = "ranging";
    confidence = Math.min((25 - adxVal) / 15, 1);
    recommendedCategories = ["mean-reversion", "order-flow"];
  }

  return {
    regime,
    confidence,
    indicators: { adx: adxVal, atr: atrVal, atrRatio, trendDirection },
    recommendedCategories,
  };
}
