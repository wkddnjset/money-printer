import { NextResponse } from "next/server";
import { fetchOHLCV } from "@/engine/ExchangeConnector";
import { getDb } from "@/lib/db";
import type { Symbol, Timeframe } from "@/types/candle";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") ?? "WLD/USDC") as Symbol;
    const timeframe = (searchParams.get("timeframe") ?? "5m") as Timeframe;
    const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);

    const candles = await fetchOHLCV(symbol, timeframe, limit);

    // 캔들 데이터를 DB에 캐시
    const db = getDb();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction(() => {
      for (const c of candles) {
        insert.run(symbol, timeframe, c.timestamp, c.open, c.high, c.low, c.close, c.volume);
      }
    });
    insertMany();

    return NextResponse.json({ candles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
