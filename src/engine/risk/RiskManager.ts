import { getDb } from "@/lib/db";
import { riskConfig } from "@/lib/config";
import type { RiskConfig, RiskCheck } from "@/types/risk";
import type { AggregatedSignal } from "@/types/signal";

interface RiskState {
  dailyLoss: number;
  consecutiveLosses: number;
}

// DB에서 오늘의 리스크 상태 로드
function loadRiskState(): RiskState {
  const db = getDb();
  const row = db.prepare("SELECT value FROM engine_state WHERE key = 'risk_state'").get() as
    | { value: string }
    | undefined;

  if (!row) return { dailyLoss: 0, consecutiveLosses: 0 };
  return JSON.parse(row.value) as RiskState;
}

// 리스크 상태 DB 저장
function saveRiskState(state: RiskState): void {
  const db = getDb();
  db.prepare("UPDATE engine_state SET value = ?, updated_at = ? WHERE key = 'risk_state'")
    .run(JSON.stringify(state), Date.now());
}

// 오늘의 총 손실 계산 (trades 테이블에서)
function getTodayLoss(): number {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END), 0) as total_loss
    FROM trades
    WHERE exit_at >= ? AND exit_at IS NOT NULL
  `).get(todayStart.getTime()) as { total_loss: number };

  return Math.abs(row.total_loss);
}

// 최근 연속 손실 횟수 계산
function getConsecutiveLosses(): number {
  const db = getDb();
  const rows = db.prepare(`
    SELECT pnl FROM trades
    WHERE exit_at IS NOT NULL AND pnl IS NOT NULL
    ORDER BY exit_at DESC LIMIT 20
  `).all() as { pnl: number }[];

  let count = 0;
  for (const row of rows) {
    if (row.pnl < 0) count++;
    else break;
  }
  return count;
}

// 최대 드로다운 계산 (일별 성과 기반)
function getMaxDrawdown(currentBalance: number): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT MAX(ending_balance) as peak_balance FROM daily_performance
  `).get() as { peak_balance: number | null };

  const peak = row?.peak_balance ?? currentBalance;
  if (peak <= 0) return 0;
  return ((peak - currentBalance) / peak) * 100;
}

/**
 * 리스크 체크 수행
 * - 일일 손실 한도
 * - 최대 드로다운
 * - 연속 손실 제한
 * - 포지션 사이즈 계산
 * - 손절/익절 가격 계산
 */
export function checkRisk(
  signal: AggregatedSignal,
  currentPrice: number,
  totalBalance: number,
  config: RiskConfig = riskConfig,
): RiskCheck {
  // hold 신호는 항상 허용 (아무것도 안 함)
  if (signal.finalAction === "hold") {
    return {
      allowed: false,
      reason: "관망 신호",
      stopLoss: 0,
      takeProfit: 0,
    };
  }

  const isBuy = signal.finalAction === "buy";

  // 1. 일일 손실 한도 체크
  const todayLoss = getTodayLoss();
  const maxDailyLoss = totalBalance * (config.maxDailyLossPercent / 100);
  if (todayLoss >= maxDailyLoss) {
    return {
      allowed: false,
      reason: `일일 손실 한도 초과 (${todayLoss.toFixed(2)} / ${maxDailyLoss.toFixed(2)} USDC)`,
      stopLoss: 0,
      takeProfit: 0,
    };
  }

  // 2. 최대 드로다운 체크
  const drawdown = getMaxDrawdown(totalBalance);
  if (drawdown >= config.maxDrawdownPercent) {
    return {
      allowed: false,
      reason: `최대 드로다운 초과 (${drawdown.toFixed(1)}% / ${config.maxDrawdownPercent}%)`,
      stopLoss: 0,
      takeProfit: 0,
    };
  }

  // 3. 연속 손실 체크
  const consecutiveLosses = getConsecutiveLosses();
  let positionReduction = 1.0;
  if (consecutiveLosses >= config.maxConsecutiveLosses) {
    positionReduction = config.consecutiveLossReduction;
  }

  // 4. 포지션 사이즈 계산
  const maxPositionValue = totalBalance * (config.maxPositionPercent / 100) * positionReduction;
  const quantity = maxPositionValue / currentPrice;

  // 5. 손절/익절 가격 계산
  const stopLoss = isBuy
    ? currentPrice * (1 - config.stopLossPercent / 100)
    : currentPrice * (1 + config.stopLossPercent / 100);

  const takeProfit = isBuy
    ? currentPrice * (1 + config.takeProfitPercent / 100)
    : currentPrice * (1 - config.takeProfitPercent / 100);

  // 리스크 상태 업데이트
  saveRiskState({ dailyLoss: todayLoss, consecutiveLosses });

  return {
    allowed: true,
    adjustedQuantity: quantity,
    stopLoss,
    takeProfit,
    reason: consecutiveLosses >= config.maxConsecutiveLosses
      ? `연속 ${consecutiveLosses}회 손실 → 포지션 ${(positionReduction * 100).toFixed(0)}%로 축소`
      : undefined,
  };
}

/**
 * 오픈 포지션에 대해 손절/익절 도달 여부 체크
 * @returns "stop_loss" | "take_profit" | null
 */
export function checkExitCondition(
  side: "buy" | "sell",
  entryPrice: number,
  currentPrice: number,
  config: RiskConfig = riskConfig,
): "stop_loss" | "take_profit" | null {
  const isBuy = side === "buy";
  const pnlPercent = isBuy
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - currentPrice) / entryPrice) * 100;

  if (pnlPercent <= -config.stopLossPercent) return "stop_loss";
  if (pnlPercent >= config.takeProfitPercent) return "take_profit";
  return null;
}

/**
 * 전략별 리스크 체크 (독립 전략 모델용)
 * - 전략별 배분 자본 기준으로 일일 손실, 연속 손실 체크
 */
export function checkStrategyRisk(
  strategyId: string,
  currentPrice: number,
  strategyBalance: number,
  config: RiskConfig = riskConfig,
): { allowed: boolean; reason?: string } {
  // 전략별 일일 손실 체크
  const db = getDb();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END), 0) as total_loss
    FROM trades
    WHERE strategy_id = ? AND exit_at >= ? AND exit_at IS NOT NULL
  `).get(strategyId, todayStart.getTime()) as { total_loss: number };

  const todayLoss = Math.abs(row.total_loss);
  const maxDailyLoss = strategyBalance * (config.maxDailyLossPercent / 100);

  if (todayLoss >= maxDailyLoss) {
    return { allowed: false, reason: `전략 일일 손실 한도 초과 (${todayLoss.toFixed(2)}/${maxDailyLoss.toFixed(2)})` };
  }

  // 전략별 연속 손실 체크 (차단이 아닌 포지션 축소)
  const lossRows = db.prepare(`
    SELECT pnl FROM trades
    WHERE strategy_id = ? AND exit_at IS NOT NULL AND pnl IS NOT NULL
    ORDER BY exit_at DESC LIMIT 20
  `).all(strategyId) as { pnl: number }[];

  let consecutive = 0;
  for (const r of lossRows) {
    if (r.pnl < 0) consecutive++;
    else break;
  }

  if (consecutive >= config.maxConsecutiveLosses) {
    const reduction = (config.consecutiveLossReduction * 100).toFixed(0);
    return { allowed: true, reason: `연속 ${consecutive}회 손실 → 포지션 ${reduction}%로 축소` };
  }

  return { allowed: true };
}

/**
 * 일일 리스크 상태 리셋 (00:00 UTC)
 */
export function resetDailyRisk(): void {
  saveRiskState({ dailyLoss: 0, consecutiveLosses: getConsecutiveLosses() });
}
