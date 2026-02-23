import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// 거래 내역 조회
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));
    const strategy = searchParams.get("strategy");
    const status = searchParams.get("status"); // "open" | "closed" | null
    const sessionId = searchParams.get("session"); // 세션 필터
    const offset = (page - 1) * limit;

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (strategy) {
      conditions.push("strategy_id = ?");
      params.push(strategy);
    }
    if (status === "open") {
      conditions.push("exit_price IS NULL");
    } else if (status === "closed") {
      conditions.push("exit_price IS NOT NULL");
    }
    if (sessionId) {
      conditions.push("session_id = ?");
      params.push(Number(sessionId));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM trades ${where}`).get(...params) as { total: number };

    const rows = db.prepare(`
      SELECT * FROM trades ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as {
      id: number; session_id: number | null; strategy_id: string; symbol: string; side: string;
      entry_price: number; exit_price: number | null; quantity: number;
      pnl: number | null; pnl_percent: number | null; fee: number;
      is_paper: number; signal_data: string | null;
      entry_at: number; exit_at: number | null; created_at: number;
    }[];

    const trades = rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      strategyId: r.strategy_id,
      symbol: r.symbol,
      side: r.side,
      entryPrice: r.entry_price,
      exitPrice: r.exit_price,
      quantity: r.quantity,
      pnl: r.pnl,
      pnlPercent: r.pnl_percent,
      fee: r.fee,
      isPaper: r.is_paper === 1,
      signalData: r.signal_data,
      entryAt: r.entry_at,
      exitAt: r.exit_at,
      createdAt: r.created_at,
    }));

    return NextResponse.json({
      trades,
      pagination: {
        page,
        limit,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / limit),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
