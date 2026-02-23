import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAllAllocations } from "@/engine/executor/PaperTrader";

// 현재 세션 전략별 자본 배분 조회 (학습 정보 포함)
export async function GET() {
  try {
    const db = getDb();

    // 현재 세션 ID
    const engineState = db.prepare("SELECT value FROM engine_state WHERE key = 'engine_running'").get() as
      | { value: string }
      | undefined;
    const sessionId = engineState ? (JSON.parse(engineState.value).sessionId as number | null) : null;

    if (!sessionId) {
      return NextResponse.json({ allocations: [], sessionId: null });
    }

    const allocations = getAllAllocations(sessionId);

    // 전략 이름 매핑
    const configRows = db.prepare(
      "SELECT strategy_id, name, category FROM strategy_configs"
    ).all() as { strategy_id: string; name: string; category: string }[];
    const nameMap = new Map(configRows.map((r) => [r.strategy_id, { name: r.name, category: r.category }]));

    // 학습 정보 매핑
    const adaptiveRows = db.prepare(
      "SELECT strategy_id, min_confidence, win_pattern_count, loss_pattern_count, last_analyzed_at FROM strategy_adaptive"
    ).all() as { strategy_id: string; min_confidence: number; win_pattern_count: number; loss_pattern_count: number; last_analyzed_at: number }[];
    const adaptiveMap = new Map(adaptiveRows.map((r) => [r.strategy_id, r]));

    // 전략별 학습 데이터 수
    const lessonCounts = db.prepare(
      "SELECT strategy_id, COUNT(*) as count FROM strategy_lessons GROUP BY strategy_id"
    ).all() as { strategy_id: string; count: number }[];
    const lessonCountMap = new Map(lessonCounts.map((r) => [r.strategy_id, r.count]));

    const data = allocations.map((a) => {
      const adaptive = adaptiveMap.get(a.strategyId);
      return {
        ...a,
        strategyName: nameMap.get(a.strategyId)?.name ?? a.strategyId,
        category: nameMap.get(a.strategyId)?.category ?? "unknown",
        minConfidence: adaptive?.min_confidence ?? 0.5,
        isConservative: (adaptive?.min_confidence ?? 0.5) > 0.5,
        lessonCount: lessonCountMap.get(a.strategyId) ?? 0,
        winPatternCount: adaptive?.win_pattern_count ?? 0,
        lossPatternCount: adaptive?.loss_pattern_count ?? 0,
      };
    });

    return NextResponse.json({ sessionId, allocations: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
