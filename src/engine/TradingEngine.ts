import { getDb } from "@/lib/db";
import { tradingConfig, riskConfig, getRiskForCategory } from "@/lib/config";
import { fetchOHLCV, fetchTicker, fetchWalletUsdcBalance, swapAllWldToUsdc } from "./ExchangeConnector";
import { initStrategyConfigs } from "./signal/SignalAggregator";
import { getEnabledStrategies } from "./strategies";
import {
  initAllocations,
  getStrategyPosition,
  getOpenPositions,
  getAllAllocations,
  getSessionTotalBalance,
  loadAllocation,
} from "./executor/PaperTrader";
import { executeStrategyBuy, executeStrategySell, checkAndClosePosition, isSwapPending } from "./executor/OrderExecutor";
import { checkStrategyRisk, resetDailyRisk } from "./risk/RiskManager";
import { checkLessonMatch, getAdaptiveThreshold, updateAllStrategies } from "./optimizer/StrategyLearner";
import type { Symbol, Timeframe, OHLCV } from "@/types/candle";
import type { Session } from "@/types/session";
import type { RiskConfig } from "@/types/risk";

interface EngineState {
  running: boolean;
  symbol: Symbol;
  timeframe: Timeframe;
  lastTick: number;
  sessionId: number | null;
  error?: string;
}

interface TickResult {
  timestamp: number;
  strategyActions: { strategyId: string; action: string; executed: boolean; reason?: string; tradeId?: number }[];
  closedPositions: number;
  newPositions: number;
}

let engineTimer: ReturnType<typeof setInterval> | null = null;
let dailyResetTimer: ReturnType<typeof setTimeout> | null = null;
let tickInProgress = false;

// --- 캔들 데이터 캐시 (API 부하 방지) ---
let cachedCandles: OHLCV[] = [];
let candleCacheTime = 0;

async function getCachedCandles(symbol: Symbol, timeframe: Timeframe): Promise<OHLCV[]> {
  const now = Date.now();
  const ttl = tradingConfig.candleCacheTtlSeconds * 1000;

  if (cachedCandles.length > 0 && now - candleCacheTime < ttl) {
    return cachedCandles;
  }

  cachedCandles = await fetchOHLCV(symbol, timeframe, 200);
  candleCacheTime = now;
  return cachedCandles;
}

// 엔진 상태 DB 읽기
function getEngineState(): EngineState {
  const db = getDb();
  const row = db.prepare("SELECT value FROM engine_state WHERE key = 'engine_running'").get() as
    | { value: string }
    | undefined;

  if (!row) return { running: false, symbol: tradingConfig.symbol, timeframe: tradingConfig.timeframe, lastTick: 0, sessionId: null };
  return JSON.parse(row.value) as EngineState;
}

// 엔진 상태 DB 저장
function saveEngineState(state: EngineState): void {
  const db = getDb();
  db.prepare("UPDATE engine_state SET value = ?, updated_at = ? WHERE key = 'engine_running'")
    .run(JSON.stringify(state), Date.now());
}

/** 활성 세션 조회 */
function getActiveSession(): Session | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM sessions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as {
    id: number; started_at: number; ended_at: number | null;
    initial_balance: number; strategy_count: number;
    allocation_per_strategy: number; status: string;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    initialBalance: row.initial_balance,
    strategyCount: row.strategy_count,
    allocationPerStrategy: row.allocation_per_strategy,
    status: row.status as "active" | "ended",
  };
}

/** 새 세션 생성 */
function createSession(initialBalance: number, strategyCount: number, allocationPerStrategy: number): Session {
  const db = getDb();
  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO sessions (started_at, initial_balance, strategy_count, allocation_per_strategy, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(now, initialBalance, strategyCount, allocationPerStrategy);

  return {
    id: Number(result.lastInsertRowid),
    startedAt: now,
    endedAt: null,
    initialBalance,
    strategyCount,
    allocationPerStrategy,
    status: "active",
  };
}

/** 세션 종료 */
function endSession(sessionId: number): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET ended_at = ?, status = 'ended' WHERE id = ?")
    .run(Date.now(), sessionId);
}

/** 세션 시작 시 초기 잔고 = 실제 지갑 USDC 잔고 */
async function calculateTotalBalance(): Promise<number> {
  try {
    const walletBalance = await fetchWalletUsdcBalance();
    if (walletBalance > 0) return walletBalance;
  } catch {
    // 지갑 조회 실패 시 fallback
  }
  return tradingConfig.paperInitialBalance;
}

/** 열린 포지션 전부 청산 (real 모드: 온체인 스왑 포함) */
async function closeAllPositions(sessionId: number): Promise<number> {
  const positions = getOpenPositions(sessionId);
  if (positions.length === 0) return 0;

  let closed = 0;
  try {
    const ticker = await fetchTicker(positions[0].symbol as Symbol);
    const price = ticker.last;

    for (const pos of positions) {
      const result = await executeStrategySell(
        sessionId, pos.id, price,
        pos.strategyId, pos.symbol as Symbol, pos.quantity,
      );
      if (result.executed) closed++;
    }
  } catch {
    // 가격 조회 실패 시 진입가로 청산 (paper 기록만)
    for (const pos of positions) {
      const result = await executeStrategySell(
        sessionId, pos.id, pos.entryPrice,
        pos.strategyId, pos.symbol as Symbol, pos.quantity,
      );
      if (result.executed) closed++;
    }
  }
  return closed;
}

/** 전략의 카테고리별 리스크 설정 가져오기 */
function getStrategyRiskConfig(strategyId: string): RiskConfig {
  const strategies = getEnabledStrategies();
  const strategy = strategies.find((s) => s.config.id === strategyId);
  if (!strategy) return riskConfig;
  return getRiskForCategory(strategy.config.category);
}

/**
 * 매 스캘핑 틱 마다 실행되는 트레이딩 루프 (5초 간격)
 * - 캔들 데이터: 30초 캐시 (API 부하 방지)
 * - 실시간 가격: 매 틱 갱신 (온체인 quoter)
 * - 전략별 독립 분석 → 매수/매도/관망 결정
 * - Real 모드: 온체인 스왑 실행 (틱 중복 보호)
 */
async function onTick(): Promise<TickResult> {
  if (tickInProgress) {
    return { timestamp: Date.now(), strategyActions: [], closedPositions: 0, newPositions: 0 };
  }
  tickInProgress = true;

  const state = getEngineState();
  if (!state.running || !state.sessionId) {
    tickInProgress = false;
    return { timestamp: Date.now(), strategyActions: [], closedPositions: 0, newPositions: 0 };
  }

  const sessionId = state.sessionId;
  const now = Date.now();
  const result: TickResult = { timestamp: now, strategyActions: [], closedPositions: 0, newPositions: 0 };

  try {
    // 1. 캔들 데이터 (캐시됨, 30초 TTL)
    const candles = await getCachedCandles(state.symbol, state.timeframe);
    if (candles.length < 50) {
      console.log(`[Tick] 캔들 부족: ${candles.length}/50`);
      return result;
    }

    // 2. 실시간 가격 (매 틱마다 갱신)
    const ticker = await fetchTicker(state.symbol);
    const currentPrice = ticker.last;

    // 3. 활성 전략 목록
    const strategies = getEnabledStrategies();

    // 4. DB에서 전략별 파라미터 로드
    const db = getDb();
    const configRows = db.prepare(
      "SELECT strategy_id, parameters FROM strategy_configs WHERE enabled = 1"
    ).all() as { strategy_id: string; parameters: string }[];
    const paramMap = new Map(configRows.map((r) => [r.strategy_id, JSON.parse(r.parameters) as Record<string, number>]));

    // 5. 현재 시장 상태
    const regimeRow = db.prepare("SELECT value FROM engine_state WHERE key = 'current_regime'").get() as { value: string } | undefined;
    const currentRegime = regimeRow ? JSON.parse(regimeRow.value).regime as string : "ranging";

    // 6. 각 전략에 대해 독립 실행
    const buySignals: string[] = [];
    const sellSignals: string[] = [];
    const blockedSignals: string[] = [];

    for (const strategy of strategies) {
      const strategyId = strategy.config.id;
      const params = paramMap.get(strategyId) ?? strategy.config.defaultParameters;
      const strategyRisk = getStrategyRiskConfig(strategyId);
      const actionEntry = { strategyId, action: "hold", executed: false, reason: undefined as string | undefined, tradeId: undefined as number | undefined };

      try {
        // 전략 분석
        const signal = strategy.analyze(candles, params);
        actionEntry.action = signal.action;

        // 풍부한 signalData 구성
        const richSignalData = JSON.stringify({
          strategyId,
          action: signal.action,
          confidence: signal.confidence,
          reason: signal.reason,
          indicators: signal.indicators,
          regime: currentRegime,
          currentPrice,
          timestamp: Date.now(),
        });

        // 열린 포지션 확인
        const openPos = getStrategyPosition(sessionId, strategyId, state.symbol);

        if (openPos) {
          // 스왑 진행중이면 스킵
          if (isSwapPending(strategyId)) {
            actionEntry.reason = "스왑 진행중";
          } else {
            // a. 열린 포지션 → SL/TP 체크 (전략별 리스크 사용)
            const closeResult = await checkAndClosePosition(sessionId, openPos, currentPrice, strategyRisk);
            if (closeResult) {
              actionEntry.executed = closeResult.executed;
              actionEntry.reason = closeResult.reason;
              actionEntry.tradeId = closeResult.trade?.id;
              if (closeResult.executed) {
                result.closedPositions++;
                sellSignals.push(`${strategyId}(${closeResult.reason})`);
              }
            } else if (signal.action === "sell" && signal.confidence >= 0.3) {
              // b. 전략이 sell 신호 → OrderExecutor로 청산
              const sellResult = await executeStrategySell(
                sessionId, openPos.id, currentPrice,
                strategyId, state.symbol, openPos.quantity,
                signal.indicators,
              );
              if (sellResult.executed) {
                actionEntry.executed = true;
                actionEntry.reason = `전략 매도 (conf: ${signal.confidence.toFixed(2)})`;
                actionEntry.tradeId = sellResult.trade?.id;
                result.closedPositions++;
                sellSignals.push(`${strategyId}(매도신호 ${signal.confidence.toFixed(2)})`);
              }
            } else {
              const pnlPct = ((currentPrice - openPos.entryPrice) / openPos.entryPrice * 100).toFixed(2);
              actionEntry.reason = `보유중 (PnL: ${pnlPct}%)`;
            }
          }
        } else if (signal.action === "buy") {
          // c. 포지션 없고 buy 신호 → 학습 체크 + 리스크 체크 후 매수
          const lessonCheck = checkLessonMatch(strategyId, signal.indicators);
          const adjustedConfidence = signal.confidence * lessonCheck.factor;
          const adaptiveThreshold = getAdaptiveThreshold(strategyId);

          if (adjustedConfidence >= adaptiveThreshold) {
            const alloc = loadAllocation(sessionId, strategyId);
            if (alloc) {
              const risk = checkStrategyRisk(strategyId, currentPrice, alloc.initialUsdc, strategyRisk);
              if (risk.allowed) {
                const buyResult = await executeStrategyBuy(sessionId, strategyId, state.symbol, currentPrice, strategyRisk, richSignalData);
                actionEntry.executed = buyResult.executed;
                actionEntry.reason = buyResult.reason;
                actionEntry.tradeId = buyResult.trade?.id;
                if (buyResult.executed) {
                  result.newPositions++;
                  buySignals.push(`${strategyId}(${signal.confidence.toFixed(2)})`);
                }
              } else {
                actionEntry.reason = risk.reason;
                blockedSignals.push(`${strategyId}(리스크:${risk.reason})`);
              }
            }
          } else {
            actionEntry.reason = lessonCheck.factor < 1.0
              ? `학습차단: ${lessonCheck.reason} (${signal.confidence.toFixed(2)}→${adjustedConfidence.toFixed(2)}<${adaptiveThreshold})`
              : `신호약함 (${adjustedConfidence.toFixed(2)}<${adaptiveThreshold})`;
            blockedSignals.push(`${strategyId}(conf:${adjustedConfidence.toFixed(2)}<${adaptiveThreshold})`);
          }
        } else {
          actionEntry.reason = signal.action === "hold"
            ? "관망"
            : `${signal.action} conf:${signal.confidence.toFixed(2)}`;
        }
      } catch (error) {
        actionEntry.reason = `에러: ${error instanceof Error ? error.message : "Unknown"}`;
      }

      result.strategyActions.push(actionEntry);
    }

    // 7. 상태 업데이트
    saveEngineState({ ...state, lastTick: now, error: undefined });

    // 8. 상세 로그
    logTickDetailed(result, currentPrice, buySignals, sellSignals, blockedSignals);

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(`[Tick ERROR] ${message}`);
    saveEngineState({ ...state, lastTick: now, error: message });
  } finally {
    tickInProgress = false;
  }

  return result;
}

function logTickDetailed(
  result: TickResult,
  price: number,
  buys: string[],
  sells: string[],
  blocked: string[],
): void {
  const time = new Date(result.timestamp).toISOString().slice(11, 19);
  const parts = [`[${time}] $${price.toFixed(4)}`];

  if (buys.length > 0) parts.push(`BUY: ${buys.join(", ")}`);
  if (sells.length > 0) parts.push(`SELL: ${sells.join(", ")}`);
  if (blocked.length > 0) parts.push(`BLOCKED: ${blocked.join(", ")}`);

  const holds = result.strategyActions.filter((a) => a.action === "hold").length;
  const positions = result.strategyActions.filter((a) => a.reason?.startsWith("보유중")).length;

  parts.push(`[H:${holds} P:${positions}]`);
  console.log(parts.join(" | "));
}

/**
 * 엔진 시작 (세션 기반, 스캘핑 모드)
 */
export async function startEngine(symbol?: Symbol, timeframe?: Timeframe): Promise<EngineState> {
  // 전략 설정 초기화
  initStrategyConfigs();

  // paper_mode DB 동기화
  const db0 = getDb();
  db0.prepare(
    "INSERT OR REPLACE INTO engine_state (key, value, updated_at) VALUES ('paper_mode', ?, ?)"
  ).run(JSON.stringify({ enabled: tradingConfig.paperMode }), Date.now());
  console.log(`[Engine] 모드: ${tradingConfig.paperMode ? "PAPER (가상)" : "REAL (실거래)"}`);

  // 기존 타이머 정리
  if (engineTimer) {
    clearInterval(engineTimer);
    engineTimer = null;
  }

  // 캔들 캐시 초기화
  cachedCandles = [];
  candleCacheTime = 0;

  // 이전 활성 세션이 있으면 종료
  const prevSession = getActiveSession();
  if (prevSession) {
    await closeAllPositions(prevSession.id);
    endSession(prevSession.id);
  }

  // WLD 전량 → USDC 스왑
  try {
    const swapResult = await swapAllWldToUsdc();
    if (swapResult.swapped) {
      console.log(`[Engine] WLD→USDC 스왑 완료: ${swapResult.wldAmount.toFixed(4)} WLD → $${swapResult.usdcReceived.toFixed(2)}`);
    }
  } catch (error) {
    console.log(`[Engine] WLD→USDC 스왑 실패 (paper 모드 계속): ${error instanceof Error ? error.message : "Unknown"}`);
  }

  // 스왑 후 USDC 잔고를 초기 잔고로 기록
  const totalBalance = await calculateTotalBalance();

  const db2 = getDb();
  db2.prepare(
    "INSERT OR REPLACE INTO engine_state (key, value, updated_at) VALUES ('session_start_balance', ?, ?)"
  ).run(JSON.stringify({ total: totalBalance, recordedAt: Date.now() }), Date.now());

  // 00시 dailyReset 타이머 설정
  scheduleDailyReset();

  // 활성 전략 목록
  const enabledStrategies = getEnabledStrategies();
  const strategyCount = enabledStrategies.length;

  if (strategyCount === 0) {
    const state: EngineState = {
      running: false,
      symbol: symbol ?? tradingConfig.symbol,
      timeframe: timeframe ?? tradingConfig.timeframe,
      lastTick: 0,
      sessionId: null,
      error: "활성 전략이 없습니다",
    };
    saveEngineState(state);
    return state;
  }

  // 균등 배분
  const allocationPerStrategy = totalBalance / strategyCount;

  // 새 세션 생성
  const session = createSession(totalBalance, strategyCount, allocationPerStrategy);

  // 전략별 배분 초기화
  const strategyIds = enabledStrategies.map((s) => s.config.id);
  initAllocations(session.id, strategyIds, allocationPerStrategy);

  const usedTimeframe = timeframe ?? tradingConfig.timeframe;
  const state: EngineState = {
    running: true,
    symbol: symbol ?? tradingConfig.symbol,
    timeframe: usedTimeframe,
    lastTick: 0,
    sessionId: session.id,
  };
  saveEngineState(state);

  const tickInterval = tradingConfig.scalpingTickSeconds * 1000;
  console.log(`[Engine] 스캘핑 모드 시작: ${strategyCount}개 전략, ${tradingConfig.scalpingTickSeconds}초 틱, ${usedTimeframe} 캔들`);
  console.log(`[Engine] 세션 #${session.id}: 총 $${totalBalance.toFixed(2)}, 전략당 $${allocationPerStrategy.toFixed(2)}`);

  // 즉시 첫 틱 실행
  onTick();

  // 스캘핑 간격으로 반복 (캔들 타임프레임이 아닌 설정된 틱 간격)
  engineTimer = setInterval(() => {
    const current = getEngineState();
    if (!current.running) {
      if (engineTimer) clearInterval(engineTimer);
      engineTimer = null;
      return;
    }
    onTick();
  }, tickInterval);

  return state;
}

/**
 * 엔진 중지
 */
export async function stopEngine(): Promise<EngineState> {
  if (engineTimer) {
    clearInterval(engineTimer);
    engineTimer = null;
  }
  if (dailyResetTimer) {
    clearTimeout(dailyResetTimer);
    dailyResetTimer = null;
  }

  const state = getEngineState();

  // 활성 세션 종료
  if (state.sessionId) {
    await closeAllPositions(state.sessionId);
    endSession(state.sessionId);
  }

  // WLD 전량 → USDC 스왑
  try {
    const swapResult = await swapAllWldToUsdc();
    if (swapResult.swapped) {
      console.log(`[Engine] 중지 스왑: ${swapResult.wldAmount.toFixed(4)} WLD → $${swapResult.usdcReceived.toFixed(2)} USDC`);
    } else {
      console.log(`[Engine] WLD 잔고 없음, 스왑 불필요`);
    }
  } catch (error) {
    console.log(`[Engine] 중지 WLD→USDC 스왑 실패: ${error instanceof Error ? error.message : "Unknown"}`);
  }

  // 세션 종료 시 전략별 학습 업데이트
  const strategies = getEnabledStrategies();
  const strategyIds = strategies.map((s) => s.config.id);
  updateAllStrategies(strategyIds);

  // 캐시 초기화
  cachedCandles = [];
  candleCacheTime = 0;

  state.running = false;
  saveEngineState(state);
  console.log(`[Engine] 중지 완료`);
  return state;
}

/**
 * 엔진 상태 조회
 */
export function getStatus(): EngineState & {
  paperMode: boolean;
  session: Session | null;
  openPositions: number;
  todayTrades: number;
  todayPnl: number;
  strategyCount: number;
  tickIntervalSeconds: number;
} {
  const state = getEngineState();
  const db = getDb();
  const session = state.sessionId ? getActiveSession() : null;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const openCount = db.prepare(
    "SELECT COUNT(*) as count FROM trades WHERE exit_price IS NULL AND session_id = ?"
  ).get(state.sessionId ?? -1) as { count: number };

  const todayStats = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(pnl), 0) as total_pnl
    FROM trades WHERE created_at >= ? AND session_id = ?
  `).get(todayStart.getTime(), state.sessionId ?? -1) as { count: number; total_pnl: number };

  const strategies = getEnabledStrategies();

  return {
    ...state,
    paperMode: tradingConfig.paperMode,
    session,
    openPositions: openCount.count,
    todayTrades: todayStats.count,
    todayPnl: todayStats.total_pnl,
    strategyCount: strategies.length,
    tickIntervalSeconds: tradingConfig.scalpingTickSeconds,
  };
}

/**
 * 수동 틱 실행 (테스트용)
 */
export async function manualTick(): Promise<TickResult> {
  const state = getEngineState();

  if (!state.sessionId) {
    return { timestamp: Date.now(), strategyActions: [], closedPositions: 0, newPositions: 0 };
  }

  // 수동 실행 시에는 running 상태와 무관하게 실행
  const savedRunning = state.running;
  saveEngineState({ ...state, running: true });

  const result = await onTick();

  if (!savedRunning) {
    const current = getEngineState();
    saveEngineState({ ...current, running: false });
  }

  return result;
}

/**
 * 일일 리셋 (00:00 UTC에 호출)
 */
export function dailyReset(): void {
  resetDailyRisk();

  const db = getDb();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  const stats = db.prepare(`
    SELECT
      COUNT(*) as trade_count,
      COALESCE(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END), 0) as win_count,
      COALESCE(SUM(pnl), 0) as total_pnl
    FROM trades
    WHERE exit_at >= ? AND exit_at < ? AND exit_at IS NOT NULL
  `).get(yesterdayStart.getTime(), todayStart.getTime()) as {
    trade_count: number; win_count: number; total_pnl: number;
  };

  if (stats.trade_count > 0) {
    const currentBalance = tradingConfig.paperInitialBalance;

    db.prepare(`
      INSERT OR REPLACE INTO daily_performance (date, starting_balance, ending_balance, total_pnl, trade_count, win_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      new Date(yesterdayStart.getTime()).toISOString().slice(0, 10),
      currentBalance - stats.total_pnl,
      currentBalance,
      stats.total_pnl,
      stats.trade_count,
      stats.win_count,
    );
  }

  // 전략별 학습 업데이트
  const strategies = getEnabledStrategies();
  const strategyIds = strategies.map((s) => s.config.id);
  updateAllStrategies(strategyIds);

  console.log(`[DailyReset] 완료 — ${strategyIds.length}개 전략 학습 업데이트, 리스크 초기화`);
}

/**
 * 다음 00:00 UTC에 dailyReset을 실행하는 타이머 설정
 */
function scheduleDailyReset(): void {
  if (dailyResetTimer) {
    clearTimeout(dailyResetTimer);
    dailyResetTimer = null;
  }

  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  console.log(`[DailyReset] 다음 실행: ${nextMidnight.toISOString()} (${Math.round(msUntilMidnight / 60000)}분 후)`);

  dailyResetTimer = setTimeout(() => {
    dailyReset();
    scheduleDailyReset();
  }, msUntilMidnight);
}
