import type { SignalAction, StrategySignal } from "./strategy";

export interface AggregatedSignal {
  finalAction: SignalAction;
  buyScore: number;
  sellScore: number;
  totalWeight: number;
  strategySignals: StrategySignal[];
  timestamp: number;
}

export interface IndependentSignalResult {
  strategyId: string;
  strategyName: string;
  action: SignalAction;
  confidence: number;
  adjustedConfidence?: number;
  minConfidence?: number;
  learningStatus?: string;
  reason: string;
  hasOpenPosition: boolean;
  unrealizedPnl: number | null;
  allocation: number;
}
