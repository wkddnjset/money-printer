export interface Session {
  id: number;
  startedAt: number;
  endedAt: number | null;
  initialBalance: number;
  strategyCount: number;
  allocationPerStrategy: number;
  status: "active" | "ended";
}

export interface StrategyAllocation {
  sessionId: number;
  strategyId: string;
  initialUsdc: number;
  currentUsdc: number;
  assetQty: number;
  tradeCount: number;
  totalPnl: number;
}
