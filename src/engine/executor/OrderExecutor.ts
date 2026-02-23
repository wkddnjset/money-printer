import { tradingConfig } from "@/lib/config";
import { createOrder } from "@/engine/ExchangeConnector";
import { paperBuy, paperSell, loadAllocation } from "./PaperTrader";
import { checkExitCondition } from "@/engine/risk/RiskManager";
import type { Trade } from "@/types/trade";
import type { RiskConfig } from "@/types/risk";
import type { Symbol } from "@/types/candle";

interface ExecutionResult {
  executed: boolean;
  trade: Trade | null;
  reason?: string;
}

/** 전략별 스왑 진행중 락 (동일 전략 중복 스왑 방지) */
const pendingSwaps = new Set<string>();

export function isSwapPending(strategyId: string): boolean {
  return pendingSwaps.has(strategyId);
}

/**
 * 전략별 매수 실행
 * - Paper 모드: DB에만 기록 (가상)
 * - Real 모드: 온체인 Uniswap 스왑 후 DB 기록
 */
export async function executeStrategyBuy(
  sessionId: number,
  strategyId: string,
  symbol: Symbol,
  price: number,
  riskConfig: RiskConfig,
  signalData?: string,
  entryIndex: number = 0,
): Promise<ExecutionResult> {
  const alloc = loadAllocation(sessionId, strategyId);
  if (!alloc) return { executed: false, trade: null, reason: "배분 정보 없음" };

  // 포지션 사이즈: 초기 배분금 × 진입 비율 (멀티엔트리)
  const weights = tradingConfig.entrySizeWeights;
  const weight = weights[Math.min(entryIndex, weights.length - 1)];
  let positionValue = alloc.initialUsdc * weight;
  // 잔액 부족 시 currentUsdc 한도 내에서 축소
  if (positionValue > alloc.currentUsdc) {
    positionValue = alloc.currentUsdc;
  }
  const quantity = positionValue / price;

  if (quantity <= 0) {
    return { executed: false, trade: null, reason: "매수 수량 0" };
  }

  const data = signalData ?? JSON.stringify({ strategyId, action: "buy", timestamp: Date.now() });

  if (tradingConfig.paperMode) {
    const trade = paperBuy(sessionId, symbol, quantity, price, strategyId, data, true);
    if (!trade) return { executed: false, trade: null, reason: "잔고 부족" };
    console.log(`[BUY:PAPER] ${strategyId}: entry ${entryIndex + 1}/${tradingConfig.maxEntriesPerStrategy} ${trade.quantity.toFixed(4)} WLD @ $${price.toFixed(4)} (SL:${riskConfig.stopLossPercent}% TP:${riskConfig.takeProfitPercent}%)`);
    return { executed: true, trade };
  }

  // --- 실거래 모드 ---
  if (pendingSwaps.has(strategyId)) {
    return { executed: false, trade: null, reason: "스왑 진행중" };
  }

  pendingSwaps.add(strategyId);
  try {
    console.log(`[BUY:REAL] ${strategyId}: entry ${entryIndex + 1}/${tradingConfig.maxEntriesPerStrategy} ${quantity.toFixed(4)} WLD 스왑 시작...`);
    const result = await createOrder({
      symbol,
      side: "buy",
      type: "market",
      quantity,
    });

    // 실제 체결 가격/수량으로 DB 기록
    const trade = paperBuy(
      sessionId, symbol, quantity, result.price,
      strategyId, data, false,
    );
    if (!trade) return { executed: false, trade: null, reason: "DB 기록 실패" };

    console.log(`[BUY:REAL] ${strategyId}: ${quantity.toFixed(4)} WLD @ $${result.price.toFixed(4)} 체결 (tx: ${result.id.slice(0, 10)}..., gas: ${result.fee.toFixed(6)} ETH)`);
    return { executed: true, trade };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.log(`[BUY:FAIL] ${strategyId}: ${msg}`);
    return { executed: false, trade: null, reason: `스왑 실패: ${msg}` };
  } finally {
    pendingSwaps.delete(strategyId);
  }
}

/**
 * 전략별 매도(청산) 실행
 * - Paper 모드: DB에만 기록
 * - Real 모드: 온체인 스왑 후 DB 기록
 */
export async function executeStrategySell(
  sessionId: number,
  tradeId: number,
  price: number,
  strategyId: string,
  symbol: Symbol,
  quantity: number,
  exitIndicators?: Record<string, number>,
): Promise<ExecutionResult> {
  if (tradingConfig.paperMode) {
    const trade = paperSell(sessionId, tradeId, price, exitIndicators);
    if (!trade) return { executed: false, trade: null, reason: "포지션 없음" };
    const pnlStr = trade.pnl !== null ? `PnL: $${trade.pnl.toFixed(4)} (${trade.pnlPercent?.toFixed(2)}%)` : "";
    console.log(`[SELL:PAPER] ${trade.strategyId}: ${trade.quantity.toFixed(4)} WLD @ $${price.toFixed(4)} ${pnlStr}`);
    return { executed: true, trade };
  }

  // --- 실거래 모드 ---
  if (pendingSwaps.has(strategyId)) {
    return { executed: false, trade: null, reason: "스왑 진행중" };
  }

  pendingSwaps.add(strategyId);
  try {
    console.log(`[SELL:REAL] ${strategyId}: ${quantity.toFixed(4)} WLD 스왑 시작...`);
    const result = await createOrder({
      symbol,
      side: "sell",
      type: "market",
      quantity,
    });

    // 실제 체결 가격으로 DB 업데이트
    const trade = paperSell(sessionId, tradeId, result.price, exitIndicators);
    if (!trade) return { executed: false, trade: null, reason: "DB 기록 실패" };

    console.log(`[SELL:REAL] ${strategyId}: ${quantity.toFixed(4)} WLD @ $${result.price.toFixed(4)} 체결 (PnL: $${trade.pnl?.toFixed(4) ?? "?"}, tx: ${result.id.slice(0, 10)}...)`);
    return { executed: true, trade };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.log(`[SELL:FAIL] ${strategyId}: ${msg}`);
    return { executed: false, trade: null, reason: `스왑 실패: ${msg}` };
  } finally {
    pendingSwaps.delete(strategyId);
  }
}

/**
 * 열린 포지션의 SL/TP 체크 후 청산 (전략별 리스크 설정 사용)
 * @returns 청산 실행 결과 (null이면 조건 미달)
 */
export async function checkAndClosePosition(
  sessionId: number,
  trade: Trade,
  currentPrice: number,
  config: RiskConfig,
): Promise<ExecutionResult | null> {
  const exitCondition = checkExitCondition(trade.side, trade.entryPrice, currentPrice, config);
  if (!exitCondition) return null;

  const pnlPct = ((currentPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2);
  const reason = exitCondition === "stop_loss"
    ? `손절 ${pnlPct}% ($${trade.entryPrice.toFixed(4)}→$${currentPrice.toFixed(4)})`
    : `익절 ${pnlPct}% ($${trade.entryPrice.toFixed(4)}→$${currentPrice.toFixed(4)})`;

  const result = await executeStrategySell(
    sessionId, trade.id, currentPrice,
    trade.strategyId, trade.symbol as Symbol, trade.quantity,
  );
  return { ...result, reason };
}
