import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAllAllocations, getSessionTotalBalance, getUnrealizedPnl } from "@/engine/executor/PaperTrader";
import { fetchWalletFullBalance } from "@/engine/ExchangeConnector";

export async function GET() {
  try {
    const db = getDb();

    // 엔진 상태 읽기
    const getState = db.prepare(
      "SELECT value FROM engine_state WHERE key = ?"
    );

    const engineRunning = JSON.parse(
      (getState.get("engine_running") as { value: string })?.value ?? '{"running":false,"sessionId":null}'
    );
    const paperMode = JSON.parse(
      (getState.get("paper_mode") as { value: string })?.value ?? '{"enabled":true}'
    );
    const currentRegime = JSON.parse(
      (getState.get("current_regime") as { value: string })?.value ?? '{"regime":"ranging","confidence":0}'
    );
    const riskState = JSON.parse(
      (getState.get("risk_state") as { value: string })?.value ?? '{"dailyLoss":0,"consecutiveLosses":0}'
    );

    const rawSessionId = engineRunning.sessionId ?? null;

    // 세션 정보 (active 세션만 유효)
    let session = null;
    let sessionId: number | null = null;
    let allocations: { strategyId: string; currentUsdc: number; assetQty: number; totalPnl: number; tradeCount: number }[] = [];

    if (rawSessionId) {
      const sessionRow = db.prepare("SELECT * FROM sessions WHERE id = ? AND status = 'active'").get(rawSessionId) as {
        id: number; started_at: number; ended_at: number | null;
        initial_balance: number; strategy_count: number;
        allocation_per_strategy: number; status: string;
      } | undefined;

      if (sessionRow) {
        sessionId = sessionRow.id;
        session = {
          id: sessionRow.id,
          startedAt: sessionRow.started_at,
          endedAt: sessionRow.ended_at,
          initialBalance: sessionRow.initial_balance,
          strategyCount: sessionRow.strategy_count,
          allocationPerStrategy: sessionRow.allocation_per_strategy,
          status: sessionRow.status,
        };

        const allocs = getAllAllocations(sessionId);
        allocations = allocs.map((a) => ({
          strategyId: a.strategyId,
          currentUsdc: a.currentUsdc,
          assetQty: a.assetQty,
          totalPnl: a.totalPnl,
          tradeCount: a.tradeCount,
        }));
      }
    }

    // 오늘 거래 통계
    const today = new Date().toISOString().split("T")[0];
    const todayStats = db
      .prepare(
        `SELECT
          COUNT(*) as tradeCount,
          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winCount,
          COALESCE(SUM(pnl), 0) as totalPnl
        FROM trades
        WHERE date(created_at / 1000, 'unixepoch') = ?`
      )
      .get(today) as { tradeCount: number; winCount: number; totalPnl: number } | undefined;

    const tradeCount = todayStats?.tradeCount ?? 0;
    const winCount = todayStats?.winCount ?? 0;

    // 전체 누적 PnL
    const allTimePnl = db.prepare(`
      SELECT COALESCE(SUM(pnl), 0) as total FROM trades WHERE exit_at IS NOT NULL
    `).get() as { total: number };

    // 실제 지갑 잔고 조회 (WLD + USDC)
    let wallet = { usdc: 0, wld: 0, wldPrice: 0, wldValue: 0, total: 0 };
    try {
      wallet = await fetchWalletFullBalance();
    } catch { /* 지갑 조회 실패 */ }

    // 초기 잔고 기록/조회
    const initialRow = db.prepare(
      "SELECT value FROM engine_state WHERE key = 'initial_wallet_balance'"
    ).get() as { value: string } | undefined;

    let initialBalance: { total: number; recordedAt: number };

    if (!initialRow) {
      // 첫 조회: 현재 지갑 잔고를 초기 잔고로 기록
      initialBalance = { total: wallet.total, recordedAt: Date.now() };
      db.prepare(
        "INSERT OR REPLACE INTO engine_state (key, value, updated_at) VALUES ('initial_wallet_balance', ?, ?)"
      ).run(JSON.stringify(initialBalance), Date.now());
    } else {
      initialBalance = JSON.parse(initialRow.value);
    }

    // 세션 기반 총 자산 vs 지갑 직접 조회
    let sessionBalance = 0;
    let unrealizedPnl = 0;

    if (sessionId && session) {
      sessionBalance = getSessionTotalBalance(sessionId, wallet.wldPrice || 1);
      unrealizedPnl = getUnrealizedPnl(sessionId, wallet.wldPrice || 1);
    }

    // 총 자산 = 항상 실제 지갑 잔고 (온체인 기준)
    const totalBalance = wallet.total;

    // 총 수익률 = (현재 총 자산 - 초기 잔고) / 초기 잔고
    const totalPnl = totalBalance - initialBalance.total;
    const totalPnlPercent = initialBalance.total > 0 ? (totalPnl / initialBalance.total) * 100 : 0;

    return NextResponse.json({
      running: engineRunning.running,
      paperMode: paperMode.enabled,
      regime: currentRegime.regime,
      sessionId,
      session,
      allocations,
      wallet: {
        usdc: wallet.usdc,
        wld: wallet.wld,
        wldPrice: wallet.wldPrice,
        wldValue: wallet.wldValue,
        total: wallet.total,
      },
      balance: { USDC: totalBalance },
      initialBalance: initialBalance.total,
      initialBalanceRecordedAt: initialBalance.recordedAt,
      unrealizedPnl,
      allTimePnl: allTimePnl.total,
      totalPnl,
      totalPnlPercent,
      todayPnl: {
        amount: todayStats?.totalPnl ?? 0,
        percent: totalBalance > 0 ? ((todayStats?.totalPnl ?? 0) / totalBalance) * 100 : 0,
      },
      totalTradesToday: tradeCount,
      winRateToday: tradeCount > 0 ? winCount / tradeCount : 0,
      riskState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
