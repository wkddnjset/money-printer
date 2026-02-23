import { getDb } from "@/lib/db";
import type { Trade } from "@/types/trade";
import type { StrategyAllocation } from "@/types/session";

const FEE_RATE = 0.001; // 0.1%

/** 세션 시작 시 전략별 자본 배분 초기화 */
export function initAllocations(
  sessionId: number,
  strategyIds: string[],
  allocationPerStrategy: number,
): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO strategy_allocations (session_id, strategy_id, initial_usdc, current_usdc, asset_qty, trade_count, total_pnl)
    VALUES (?, ?, ?, ?, 0, 0, 0)
  `);

  const tx = db.transaction(() => {
    for (const sid of strategyIds) {
      insert.run(sessionId, sid, allocationPerStrategy, allocationPerStrategy);
    }
  });
  tx();
}

/** 전략 배분 정보 로드 */
export function loadAllocation(sessionId: number, strategyId: string): StrategyAllocation | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT session_id, strategy_id, initial_usdc, current_usdc, asset_qty, trade_count, total_pnl
    FROM strategy_allocations WHERE session_id = ? AND strategy_id = ?
  `).get(sessionId, strategyId) as {
    session_id: number; strategy_id: string; initial_usdc: number;
    current_usdc: number; asset_qty: number; trade_count: number; total_pnl: number;
  } | undefined;

  if (!row) return null;
  return {
    sessionId: row.session_id,
    strategyId: row.strategy_id,
    initialUsdc: row.initial_usdc,
    currentUsdc: row.current_usdc,
    assetQty: row.asset_qty,
    tradeCount: row.trade_count,
    totalPnl: row.total_pnl,
  };
}

/** 전략별 매수 기록 (paper/real 공용) */
export function paperBuy(
  sessionId: number,
  symbol: string,
  quantity: number,
  price: number,
  strategyId: string,
  signalData?: string,
  isPaper: boolean = true,
): Trade | null {
  const alloc = loadAllocation(sessionId, strategyId);
  if (!alloc) return null;

  const cost = quantity * price;
  const fee = cost * FEE_RATE;

  // 잔고 부족 시 가능한 만큼만 매수
  if (alloc.currentUsdc < cost + fee) {
    const maxCost = alloc.currentUsdc / (1 + FEE_RATE);
    quantity = maxCost / price;
    if (quantity <= 0) return null;
  }

  const totalCost = quantity * price;
  const actualFee = totalCost * FEE_RATE;

  const db = getDb();
  const now = Date.now();

  // trades에 기록
  const result = db.prepare(`
    INSERT INTO trades (session_id, strategy_id, symbol, side, entry_price, quantity, fee, is_paper, signal_data, entry_at)
    VALUES (?, ?, ?, 'buy', ?, ?, ?, ?, ?, ?)
  `).run(sessionId, strategyId, symbol, price, quantity, actualFee, isPaper ? 1 : 0, signalData ?? null, now);

  // 배분 업데이트
  db.prepare(`
    UPDATE strategy_allocations
    SET current_usdc = current_usdc - ?, asset_qty = asset_qty + ?
    WHERE session_id = ? AND strategy_id = ?
  `).run(totalCost + actualFee, quantity, sessionId, strategyId);

  return {
    id: Number(result.lastInsertRowid),
    sessionId,
    strategyId,
    symbol,
    side: "buy",
    entryPrice: price,
    exitPrice: null,
    quantity,
    pnl: null,
    pnlPercent: null,
    fee: actualFee,
    isPaper: isPaper,
    signalData: signalData ?? null,
    entryAt: now,
    exitAt: null,
    createdAt: now,
  };
}

/** 전략별 매도/청산 기록 (paper/real 공용) */
export function paperSell(
  sessionId: number,
  tradeId: number,
  price: number,
  exitIndicators?: Record<string, number>,
): Trade | null {
  const db = getDb();

  const openTrade = db.prepare(`
    SELECT * FROM trades WHERE id = ? AND exit_price IS NULL AND session_id = ?
  `).get(tradeId, sessionId) as {
    id: number; session_id: number; strategy_id: string; symbol: string; side: string;
    entry_price: number; quantity: number; fee: number; is_paper: number; signal_data: string | null;
    entry_at: number; created_at: number;
  } | undefined;

  if (!openTrade) return null;

  const revenue = openTrade.quantity * price;
  const fee = revenue * FEE_RATE;
  const pnl = revenue - (openTrade.quantity * openTrade.entry_price) - fee - openTrade.fee;
  const pnlPercent = ((price - openTrade.entry_price) / openTrade.entry_price) * 100;

  const now = Date.now();

  // trades 업데이트
  db.prepare(`
    UPDATE trades SET exit_price = ?, pnl = ?, pnl_percent = ?, fee = fee + ?, exit_at = ?
    WHERE id = ?
  `).run(price, pnl, pnlPercent, fee, now, tradeId);

  // 배분 업데이트: USDC 복귀, 에셋 제거, PnL 누적
  db.prepare(`
    UPDATE strategy_allocations
    SET current_usdc = current_usdc + ?,
        asset_qty = MAX(0, asset_qty - ?),
        trade_count = trade_count + 1,
        total_pnl = total_pnl + ?
    WHERE session_id = ? AND strategy_id = ?
  `).run(revenue - fee, openTrade.quantity, pnl, sessionId, openTrade.strategy_id);

  // strategy_lessons에 학습 데이터 기록
  let entryIndicators = "{}";
  if (openTrade.signal_data) {
    try {
      const parsed = JSON.parse(openTrade.signal_data);
      entryIndicators = JSON.stringify(parsed.indicators ?? {});
    } catch { /* ignore */ }
  }

  const holdDuration = now - openTrade.entry_at;
  let marketRegime: string | null = null;
  if (openTrade.signal_data) {
    try {
      const parsed = JSON.parse(openTrade.signal_data);
      marketRegime = parsed.regime ?? null;
    } catch { /* ignore */ }
  }

  db.prepare(`
    INSERT INTO strategy_lessons (strategy_id, session_id, entry_indicators, exit_indicators, entry_price, exit_price, pnl, pnl_percent, hold_duration, market_regime, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    openTrade.strategy_id, sessionId, entryIndicators,
    exitIndicators ? JSON.stringify(exitIndicators) : null,
    openTrade.entry_price, price, pnl, pnlPercent,
    holdDuration, marketRegime, now,
  );

  return {
    id: openTrade.id,
    sessionId,
    strategyId: openTrade.strategy_id,
    symbol: openTrade.symbol,
    side: openTrade.side as "buy" | "sell",
    entryPrice: openTrade.entry_price,
    exitPrice: price,
    quantity: openTrade.quantity,
    pnl,
    pnlPercent,
    fee: openTrade.fee + fee,
    isPaper: openTrade.is_paper === 1,
    signalData: openTrade.signal_data,
    entryAt: openTrade.entry_at,
    exitAt: now,
    createdAt: openTrade.created_at,
  };
}

/** 특정 전략의 열린 포지션 조회 (전략당 최대 1개) */
export function getStrategyPosition(
  sessionId: number,
  strategyId: string,
  symbol: string,
): Trade | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM trades
    WHERE session_id = ? AND strategy_id = ? AND symbol = ? AND exit_price IS NULL
    ORDER BY entry_at DESC LIMIT 1
  `).get(sessionId, strategyId, symbol) as {
    id: number; session_id: number; strategy_id: string; symbol: string; side: string;
    entry_price: number; exit_price: number | null; quantity: number;
    pnl: number | null; pnl_percent: number | null; fee: number;
    is_paper: number; signal_data: string | null;
    entry_at: number; exit_at: number | null; created_at: number;
  } | undefined;

  if (!row) return null;
  return mapRowToTrade(row);
}

/** 특정 전략의 모든 열린 포지션 조회 (멀티엔트리용) */
export function getStrategyPositions(
  sessionId: number,
  strategyId: string,
  symbol: string,
): Trade[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM trades
    WHERE session_id = ? AND strategy_id = ? AND symbol = ? AND exit_price IS NULL
    ORDER BY entry_at ASC
  `).all(sessionId, strategyId, symbol) as {
    id: number; session_id: number; strategy_id: string; symbol: string; side: string;
    entry_price: number; exit_price: number | null; quantity: number;
    pnl: number | null; pnl_percent: number | null; fee: number;
    is_paper: number; signal_data: string | null;
    entry_at: number; exit_at: number | null; created_at: number;
  }[];

  return rows.map(mapRowToTrade);
}

/** 현재 세션의 모든 열린 포지션 조회 */
export function getOpenPositions(sessionId: number): Trade[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM trades
    WHERE session_id = ? AND exit_price IS NULL
    ORDER BY entry_at DESC
  `).all(sessionId) as {
    id: number; session_id: number; strategy_id: string; symbol: string; side: string;
    entry_price: number; exit_price: number | null; quantity: number;
    pnl: number | null; pnl_percent: number | null; fee: number;
    is_paper: number; signal_data: string | null;
    entry_at: number; exit_at: number | null; created_at: number;
  }[];

  return rows.map(mapRowToTrade);
}

/** 현재 세션의 모든 전략 배분 조회 */
export function getAllAllocations(sessionId: number): StrategyAllocation[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT session_id, strategy_id, initial_usdc, current_usdc, asset_qty, trade_count, total_pnl
    FROM strategy_allocations WHERE session_id = ?
  `).all(sessionId) as {
    session_id: number; strategy_id: string; initial_usdc: number;
    current_usdc: number; asset_qty: number; trade_count: number; total_pnl: number;
  }[];

  return rows.map((r) => ({
    sessionId: r.session_id,
    strategyId: r.strategy_id,
    initialUsdc: r.initial_usdc,
    currentUsdc: r.current_usdc,
    assetQty: r.asset_qty,
    tradeCount: r.trade_count,
    totalPnl: r.total_pnl,
  }));
}

/** 세션의 총 USDC 잔고 합계 (현금 + 에셋 가치) */
export function getSessionTotalBalance(sessionId: number, currentPrice: number): number {
  const allocations = getAllAllocations(sessionId);
  return allocations.reduce(
    (sum, a) => sum + a.currentUsdc + a.assetQty * currentPrice,
    0,
  );
}

/** 세션의 미실현 PnL 합계 (열린 포지션) */
export function getUnrealizedPnl(sessionId: number, currentPrice: number): number {
  const positions = getOpenPositions(sessionId);
  return positions.reduce((sum, pos) => {
    const unrealized = (currentPrice - pos.entryPrice) * pos.quantity;
    return sum + unrealized;
  }, 0);
}

// DB 행 → Trade 매핑
function mapRowToTrade(r: {
  id: number; session_id: number; strategy_id: string; symbol: string; side: string;
  entry_price: number; exit_price: number | null; quantity: number;
  pnl: number | null; pnl_percent: number | null; fee: number;
  is_paper: number; signal_data: string | null;
  entry_at: number; exit_at: number | null; created_at: number;
}): Trade {
  return {
    id: r.id,
    sessionId: r.session_id,
    strategyId: r.strategy_id,
    symbol: r.symbol,
    side: r.side as "buy" | "sell",
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
  };
}
