import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAllStrategies } from "@/engine/strategies";

// 전략 설정 목록 조회
export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT strategy_id, name, category, difficulty, enabled, weight, parameters, description
      FROM strategy_configs ORDER BY category, strategy_id
    `).all() as {
      strategy_id: string; name: string; category: string; difficulty: string;
      enabled: number; weight: number; parameters: string; description: string;
    }[];

    // DB에 없으면 전략 목록에서 기본값 반환
    if (rows.length === 0) {
      const defaults = getAllStrategies().map((s) => ({
        strategyId: s.config.id,
        name: s.config.name,
        category: s.config.category,
        difficulty: s.config.difficulty,
        enabled: true,
        weight: 1.0,
        parameters: s.config.defaultParameters,
        description: s.config.description,
      }));
      return NextResponse.json({ configs: defaults });
    }

    const configs = rows.map((r) => ({
      strategyId: r.strategy_id,
      name: r.name,
      category: r.category,
      difficulty: r.difficulty,
      enabled: r.enabled === 1,
      weight: r.weight,
      parameters: JSON.parse(r.parameters),
      description: r.description,
    }));

    return NextResponse.json({ configs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 개별 전략 설정 업데이트
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { strategyId, enabled, weight, parameters } = body as {
      strategyId: string; enabled?: boolean; weight?: number; parameters?: Record<string, number>;
    };

    if (!strategyId) {
      return NextResponse.json({ error: "strategyId required" }, { status: 400 });
    }

    const db = getDb();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (enabled !== undefined) {
      updates.push("enabled = ?");
      values.push(enabled ? 1 : 0);
    }
    if (weight !== undefined) {
      updates.push("weight = ?");
      values.push(weight);
    }
    if (parameters !== undefined) {
      updates.push("parameters = ?");
      values.push(JSON.stringify(parameters));
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(strategyId);
    db.prepare(`UPDATE strategy_configs SET ${updates.join(", ")} WHERE strategy_id = ?`).run(...values);

    return NextResponse.json({ ok: true, strategyId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
