export interface OHLCV {
  timestamp: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "1m" | "3m" | "5m" | "15m";
export type Symbol = "WLD/USDC" | "ETH/USDC" | "SOL/USDC";
