import type { Symbol, Timeframe } from "./candle";

export interface BacktestConfig {
  strategyId: string;
  symbol: Symbol;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  parameters: Record<string, number>;
  initialBalance: number;       // 기본 10000 USDC
  feeRate: number;              // 기본 0.001 (0.1%)
  slippageRate: number;         // 기본 0.0005 (0.05%)
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  side: "buy" | "sell";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  fee: number;
  reason: string;
}

export interface BacktestResult {
  strategyId: string;
  parameters: Record<string, number>;
  winRate: number;              // 0.0 ~ 1.0
  totalReturn: number;          // %
  maxDrawdown: number;          // %
  sharpeRatio: number;
  tradeCount: number;
  avgTradePnl: number;
  profitFactor: number;         // total profit / total loss
  trades: BacktestTrade[];
}

export interface GridSearchConfig {
  strategyId: string;
  parameterGrid: Record<string, number[]>;
  optimizeFor: "sharpe" | "return" | "winRate";
}

export interface GridSearchResult {
  strategyId: string;
  bestParams: Record<string, number>;
  bestScore: number;
  optimizeFor: string;
  testedCombinations: number;
  topResults: {
    params: Record<string, number>;
    score: number;
    winRate: number;
    totalReturn: number;
    sharpeRatio: number;
  }[];
}

export interface WalkForwardConfig {
  inSampleRatio: number;        // 기본 0.7 (70% 학습)
  outSampleRatio: number;       // 기본 0.3 (30% 검증)
  minPassRatio: number;         // 기본 0.5 (검증 ≥ 50% of 학습)
}

export interface WalkForwardResult {
  strategyId: string;
  passed: boolean;
  inSampleReturn: number;
  outSampleReturn: number;
  passRatio: number;            // outSample / inSample
  parameters: Record<string, number>;
}

export interface RegimeAnalysis {
  regime: "trending_up" | "trending_down" | "ranging" | "volatile";
  confidence: number;           // 0.0 ~ 1.0
  indicators: {
    adx: number;
    atr: number;
    atrRatio: number;           // current ATR / average ATR
    trendDirection: number;     // +1 up, -1 down, 0 ranging
  };
  recommendedCategories: string[];
}
