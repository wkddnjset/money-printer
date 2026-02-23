import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fetchOHLCV } from "@/engine/ExchangeConnector";
import { runBacktest } from "@/engine/backtest/BacktestEngine";
import { gridSearch, buildGridFromStrategy } from "@/engine/backtest/GridSearch";
import { walkForwardValidation } from "@/engine/backtest/WalkForward";
import type { Symbol, Timeframe } from "@/types/candle";

// 백테스트 실행
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { strategyId, symbol, timeframe, days, optimize } = body as {
      strategyId: string;
      symbol?: Symbol;
      timeframe?: Timeframe;
      days?: number;
      optimize?: boolean;
    };

    const sym = symbol ?? "WLD/USDC";
    const tf = timeframe ?? "5m";
    const candles = await fetchOHLCV(sym as Symbol, tf as Timeframe, 2000);

    if (candles.length < 100) {
      return NextResponse.json({ error: "캔들 데이터 부족" }, { status: 400 });
    }

    // 기간 필터
    const periodMs = (days ?? 7) * 24 * 60 * 60 * 1000;
    const endTime = candles[candles.length - 1].timestamp;
    const startTime = endTime - periodMs;
    const filtered = candles.filter((c) => c.timestamp >= startTime);

    if (optimize) {
      // 그리드 탐색 + 워크포워드
      const grid = buildGridFromStrategy(strategyId);
      const gridResult = gridSearch(
        { strategyId, parameterGrid: grid, optimizeFor: "sharpe" },
        filtered, sym as Symbol, tf as Timeframe,
      );

      const wfResult = walkForwardValidation(
        strategyId, gridResult.bestParams, filtered, sym as Symbol, tf as Timeframe,
      );

      return NextResponse.json({
        gridSearch: gridResult,
        walkForward: wfResult,
      });
    }

    // 현재 파라미터로 백테스트
    const db = getDb();
    const configRow = db.prepare("SELECT parameters FROM strategy_configs WHERE strategy_id = ?")
      .get(strategyId) as { parameters: string } | undefined;
    const params = configRow ? JSON.parse(configRow.parameters) : {};

    const result = runBacktest({
      strategyId,
      symbol: sym as Symbol,
      timeframe: tf as Timeframe,
      startTime,
      endTime,
      parameters: params,
      initialBalance: 10000,
      feeRate: 0.001,
      slippageRate: 0.0005,
    }, filtered);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 백테스트 결과 이력 조회
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const strategyId = searchParams.get("strategyId");
    const limit = Math.min(50, Number(searchParams.get("limit") ?? 20));

    const db = getDb();
    let query = "SELECT * FROM backtest_results";
    const params: unknown[] = [];

    if (strategyId) {
      query += " WHERE strategy_id = ?";
      params.push(strategyId);
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = db.prepare(query).all(...params) as {
      id: number; strategy_id: string; timeframe: string;
      period_start: number; period_end: number;
      win_rate: number; total_return: number; max_drawdown: number;
      sharpe_ratio: number | null; trade_count: number; avg_trade_pnl: number | null;
      parameters: string; walk_forward_pass: number | null; created_at: number;
    }[];

    const results = rows.map((r) => ({
      id: r.id,
      strategyId: r.strategy_id,
      timeframe: r.timeframe,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      winRate: r.win_rate,
      totalReturn: r.total_return,
      maxDrawdown: r.max_drawdown,
      sharpeRatio: r.sharpe_ratio,
      tradeCount: r.trade_count,
      avgTradePnl: r.avg_trade_pnl,
      parameters: JSON.parse(r.parameters),
      walkForwardPass: r.walk_forward_pass,
      createdAt: r.created_at,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
