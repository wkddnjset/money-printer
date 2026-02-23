export interface RiskConfig {
  stopLossPercent: number; // 기본 1.0%
  takeProfitPercent: number; // 기본 1.5%
  maxPositionPercent: number; // 기본 5.0% (총자산 대비)
  maxDailyLossPercent: number; // 기본 3.0%
  maxDrawdownPercent: number; // 기본 15.0%
  maxConsecutiveLosses: number; // 기본 3
  consecutiveLossReduction: number; // 기본 0.5 (50% 축소)
}

export interface RiskCheck {
  allowed: boolean;
  reason?: string;
  adjustedQuantity?: number;
  stopLoss: number;
  takeProfit: number;
}
