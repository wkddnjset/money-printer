import type { OHLCV, Timeframe } from "./candle";

export type SignalAction = "buy" | "sell" | "hold";
export type StrategyCategory =
  | "mean-reversion"
  | "trend-following"
  | "breakout"
  | "momentum"
  | "divergence"
  | "order-flow";
export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface StrategySignal {
  action: SignalAction;
  confidence: number; // 0.0 ~ 1.0
  strategyId: string;
  reason: string;
  indicators: Record<string, number>;
  timestamp: number;
}

export interface StrategyConfig {
  id: string;
  name: string;
  category: StrategyCategory;
  difficulty: Difficulty;
  description: string;
  defaultParameters: Record<string, number>;
  parameterRanges: Record<string, { min: number; max: number; step: number }>;
  requiredIndicators: string[];
  recommendedTimeframes: Timeframe[];
}

export interface Strategy {
  readonly config: StrategyConfig;
  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal;
}
