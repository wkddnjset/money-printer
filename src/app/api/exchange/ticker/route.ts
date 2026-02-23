import { NextResponse } from "next/server";
import { fetchTicker } from "@/engine/ExchangeConnector";
import type { Symbol } from "@/types/candle";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") ?? "WLD/USDC") as Symbol;

    const ticker = await fetchTicker(symbol);
    return NextResponse.json(ticker);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
