import { NextResponse } from "next/server";
import { fetchOHLCV } from "@/engine/ExchangeConnector";
import { getEnabledStrategies } from "@/engine/strategies";
import { getStrategyPosition } from "@/engine/executor/PaperTrader";
import { checkLessonMatch, getAdaptiveThreshold } from "@/engine/optimizer/StrategyLearner";
import { getDb } from "@/lib/db";
import type { Symbol, Timeframe } from "@/types/candle";
import type { IndependentSignalResult } from "@/types/signal";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") ?? "WLD/USDC") as Symbol;
    const timeframe = (searchParams.get("timeframe") ?? "5m") as Timeframe;

    const candles = await fetchOHLCV(symbol, timeframe, 200);
    if (candles.length < 50) {
      return NextResponse.json({ signals: [], error: "캔들 데이터 부족" });
    }

    const strategies = getEnabledStrategies();
    const db = getDb();

    // 현재 세션 ID
    const engineState = db.prepare("SELECT value FROM engine_state WHERE key = 'engine_running'").get() as
      | { value: string }
      | undefined;
    const sessionId = engineState ? (JSON.parse(engineState.value).sessionId as number | null) : null;

    // 전략별 파라미터
    const configRows = db.prepare(
      "SELECT strategy_id, parameters FROM strategy_configs WHERE enabled = 1"
    ).all() as { strategy_id: string; parameters: string }[];
    const paramMap = new Map(configRows.map((r) => [r.strategy_id, JSON.parse(r.parameters) as Record<string, number>]));

    // 전략별 배분 정보
    let allocMap = new Map<string, number>();
    if (sessionId) {
      const allocs = db.prepare(
        "SELECT strategy_id, current_usdc FROM strategy_allocations WHERE session_id = ?"
      ).all(sessionId) as { strategy_id: string; current_usdc: number }[];
      allocMap = new Map(allocs.map((a) => [a.strategy_id, a.current_usdc]));
    }

    const currentPrice = candles[candles.length - 1].close;

    const signals: IndependentSignalResult[] = [];

    for (const strategy of strategies) {
      const id = strategy.config.id;
      const params = paramMap.get(id) ?? strategy.config.defaultParameters;

      try {
        const signal = strategy.analyze(candles, params);

        // 열린 포지션 확인
        let hasOpenPosition = false;
        let unrealizedPnl: number | null = null;

        if (sessionId) {
          const pos = getStrategyPosition(sessionId, id, symbol);
          if (pos) {
            hasOpenPosition = true;
            unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;
          }
        }

        // 학습 기반 조정
        const lessonCheck = checkLessonMatch(id, signal.indicators);
        const adjustedConfidence = signal.confidence * lessonCheck.factor;
        const minConfidence = getAdaptiveThreshold(id);

        signals.push({
          strategyId: id,
          strategyName: strategy.config.name,
          action: signal.action,
          confidence: signal.confidence,
          adjustedConfidence,
          minConfidence,
          learningStatus: lessonCheck.reason,
          reason: signal.reason,
          hasOpenPosition,
          unrealizedPnl,
          allocation: allocMap.get(id) ?? 0,
        });
      } catch {
        // 개별 전략 에러 무시
      }
    }

    return NextResponse.json({ symbol, timeframe, signals });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
