export interface Trade {
  id: number;
  sessionId: number | null;
  strategyId: string;
  symbol: string;
  side: "buy" | "sell";
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number | null;
  pnlPercent: number | null;
  fee: number;
  isPaper: boolean;
  signalData: string | null;
  entryAt: number;
  exitAt: number | null;
  createdAt: number;
}
