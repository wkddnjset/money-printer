import { NextResponse } from "next/server";
import { startEngine, stopEngine, getStatus, manualTick } from "@/engine/TradingEngine";
import type { Symbol, Timeframe } from "@/types/candle";

// 엔진 시작/중지/수동틱
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, symbol, timeframe } = body as {
      action: "start" | "stop" | "tick";
      symbol?: Symbol;
      timeframe?: Timeframe;
    };

    switch (action) {
      case "start": {
        const state = await startEngine(symbol, timeframe);
        return NextResponse.json({ ok: true, action: "started", state });
      }
      case "stop": {
        const state = await stopEngine();
        return NextResponse.json({ ok: true, action: "stopped", state });
      }
      case "tick": {
        const result = await manualTick();
        return NextResponse.json({ ok: true, action: "tick", result });
      }
      default:
        return NextResponse.json({ error: "Invalid action. Use: start, stop, tick" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 엔진 상세 상태 조회
export async function GET() {
  try {
    const status = getStatus();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
