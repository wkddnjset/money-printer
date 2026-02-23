import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runDailyRebalance } from "@/engine/backtest/DailyRebalancer";

// 수동 리밸런싱 실행
export async function POST() {
  try {
    const result = await runDailyRebalance();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 리밸런싱 이력 조회
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));

    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM rebalance_log ORDER BY executed_at DESC LIMIT ?
    `).all(limit) as {
      id: number; executed_at: number; strategy_id: string;
      change_type: string; old_value: string; new_value: string; reason: string;
    }[];

    const logs = rows.map((r) => ({
      id: r.id,
      executedAt: r.executed_at,
      strategyId: r.strategy_id,
      changeType: r.change_type,
      oldValue: r.old_value,
      newValue: r.new_value,
      reason: r.reason,
    }));

    return NextResponse.json({ logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
