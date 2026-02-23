import type { OHLCV } from "@/types/candle";
import type { BacktestConfig, BacktestResult, BacktestTrade } from "@/types/backtest";
import { getStrategy } from "@/engine/strategies";
import type { Strategy } from "@/types/strategy";

/**
 * 백테스트 엔진
 * 과거 캔들 데이터로 전략을 시뮬레이션하여 성과 지표 계산
 */
export function runBacktest(
  config: BacktestConfig,
  candles: OHLCV[],
): BacktestResult {
  const strategy = getStrategy(config.strategyId);
  if (!strategy) {
    return emptyResult(config.strategyId, config.parameters);
  }

  // 시간 범위 필터
  const filtered = candles.filter(
    (c) => c.timestamp >= config.startTime && c.timestamp <= config.endTime,
  );
  if (filtered.length < 50) {
    return emptyResult(config.strategyId, config.parameters);
  }

  return simulateTrades(strategy, filtered, config);
}

function simulateTrades(
  strategy: Strategy,
  candles: OHLCV[],
  config: BacktestConfig,
): BacktestResult {
  const trades: BacktestTrade[] = [];
  let balance = config.initialBalance;
  let peakBalance = balance;
  let maxDrawdown = 0;
  let position: { side: "buy" | "sell"; entryPrice: number; entryTime: number; quantity: number } | null = null;

  // 최소 50개 캔들이 지나야 지표 계산 가능
  const startIdx = Math.max(50, Math.floor(candles.length * 0.05));

  for (let i = startIdx; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const currentCandle = candles[i];

    // 포지션이 있을 때 손절/익절 체크
    if (position) {
      const pnlPercent = position.side === "buy"
        ? ((currentCandle.close - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - currentCandle.close) / position.entryPrice) * 100;

      // 손절 (1%) 또는 익절 (1.5%)
      if (pnlPercent <= -1.0 || pnlPercent >= 1.5) {
        const exitPrice = applySlippage(currentCandle.close, position.side === "buy" ? "sell" : "buy", config.slippageRate);
        const fee = position.quantity * exitPrice * config.feeRate;
        const pnl = position.side === "buy"
          ? (exitPrice - position.entryPrice) * position.quantity - fee
          : (position.entryPrice - exitPrice) * position.quantity - fee;

        trades.push({
          entryTime: position.entryTime,
          exitTime: currentCandle.timestamp,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice,
          quantity: position.quantity,
          pnl,
          pnlPercent: pnl / (position.quantity * position.entryPrice) * 100,
          fee: fee + position.quantity * position.entryPrice * config.feeRate,
          reason: pnlPercent <= -1.0 ? "stop_loss" : "take_profit",
        });

        balance += pnl;
        position = null;
      }
    }

    // 전략 신호 분석
    try {
      const signal = strategy.analyze(slice, config.parameters);

      if (!position && signal.action !== "hold" && signal.confidence >= 0.5) {
        // 포지션 진입
        const entryPrice = applySlippage(currentCandle.close, signal.action, config.slippageRate);
        const positionSize = balance * 0.05; // 잔고의 5%
        const quantity = positionSize / entryPrice;
        const fee = quantity * entryPrice * config.feeRate;

        if (balance >= positionSize + fee) {
          position = {
            side: signal.action,
            entryPrice,
            entryTime: currentCandle.timestamp,
            quantity,
          };
          balance -= fee;
        }
      } else if (position && signal.action !== "hold") {
        // 반대 신호 시 포지션 종료
        const shouldClose =
          (position.side === "buy" && signal.action === "sell") ||
          (position.side === "sell" && signal.action === "buy");

        if (shouldClose && signal.confidence >= 0.6) {
          const exitPrice = applySlippage(currentCandle.close, position.side === "buy" ? "sell" : "buy", config.slippageRate);
          const fee = position.quantity * exitPrice * config.feeRate;
          const pnl = position.side === "buy"
            ? (exitPrice - position.entryPrice) * position.quantity - fee
            : (position.entryPrice - exitPrice) * position.quantity - fee;

          trades.push({
            entryTime: position.entryTime,
            exitTime: currentCandle.timestamp,
            side: position.side,
            entryPrice: position.entryPrice,
            exitPrice,
            quantity: position.quantity,
            pnl,
            pnlPercent: pnl / (position.quantity * position.entryPrice) * 100,
            fee: fee + position.quantity * position.entryPrice * config.feeRate,
            reason: "signal_reverse",
          });

          balance += pnl;
          position = null;
        }
      }
    } catch {
      // 전략 에러 무시
    }

    // 드로다운 계산
    if (balance > peakBalance) peakBalance = balance;
    const drawdown = peakBalance > 0 ? ((peakBalance - balance) / peakBalance) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // 미청산 포지션 강제 종료
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;
    const fee = position.quantity * exitPrice * config.feeRate;
    const pnl = position.side === "buy"
      ? (exitPrice - position.entryPrice) * position.quantity - fee
      : (position.entryPrice - exitPrice) * position.quantity - fee;

    trades.push({
      entryTime: position.entryTime,
      exitTime: lastCandle.timestamp,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      pnl,
      pnlPercent: pnl / (position.quantity * position.entryPrice) * 100,
      fee: fee + position.quantity * position.entryPrice * config.feeRate,
      reason: "period_end",
    });
    balance += pnl;
  }

  return calculateMetrics(config.strategyId, config.parameters, trades, config.initialBalance, balance, maxDrawdown);
}

function applySlippage(price: number, side: "buy" | "sell", slippageRate: number): number {
  return side === "buy" ? price * (1 + slippageRate) : price * (1 - slippageRate);
}

function calculateMetrics(
  strategyId: string,
  parameters: Record<string, number>,
  trades: BacktestTrade[],
  initialBalance: number,
  finalBalance: number,
  maxDrawdown: number,
): BacktestResult {
  if (trades.length === 0) return emptyResult(strategyId, parameters);

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const totalProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  const totalReturn = ((finalBalance - initialBalance) / initialBalance) * 100;
  const winRate = wins.length / trades.length;
  const avgTradePnl = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  // 간략 Sharpe Ratio (일별 수익률 기반 근사)
  const returns = trades.map((t) => t.pnlPercent);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const stdDev = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  return {
    strategyId,
    parameters,
    winRate,
    totalReturn,
    maxDrawdown,
    sharpeRatio,
    tradeCount: trades.length,
    avgTradePnl,
    profitFactor,
    trades,
  };
}

function emptyResult(strategyId: string, parameters: Record<string, number>): BacktestResult {
  return {
    strategyId,
    parameters,
    winRate: 0,
    totalReturn: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    tradeCount: 0,
    avgTradePnl: 0,
    profitFactor: 0,
    trades: [],
  };
}
