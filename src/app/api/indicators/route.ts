import { NextResponse } from "next/server";
import { fetchOHLCV } from "@/engine/ExchangeConnector";
import { getAllIndicators } from "@/engine/indicators";
import type { Symbol, Timeframe } from "@/types/candle";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") ?? "WLD/USDC") as Symbol;
    const timeframe = (searchParams.get("timeframe") ?? "5m") as Timeframe;
    const indicatorIds = searchParams.get("ids")?.split(",") ?? ["rsi", "ema", "bb"];

    const candles = await fetchOHLCV(symbol, timeframe, 200);
    const indicators = getAllIndicators();

    const results: Record<string, unknown[]> = {};

    for (const ind of indicators) {
      if (!indicatorIds.includes(ind.id)) continue;

      const params: Record<string, number> = {};
      // 기본 파라미터 적용
      if (ind.id === "rsi") params.period = 14;
      if (ind.id === "ema") params.period = 9;
      if (ind.id === "bb") {
        params.period = 20;
        params.stdDev = 2;
      }
      if (ind.id === "macd") {
        params.fastPeriod = 12;
        params.slowPeriod = 26;
        params.signalPeriod = 9;
      }
      if (ind.id === "atr") params.period = 14;
      if (ind.id === "adx") params.period = 14;
      if (ind.id === "stochrsi") {
        params.rsiPeriod = 14;
        params.stochPeriod = 14;
        params.kPeriod = 3;
        params.dPeriod = 3;
      }

      results[ind.id] = ind.calculate(candles, params);
    }

    return NextResponse.json({ symbol, timeframe, indicators: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
