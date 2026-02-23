export interface Balance {
  currency: string;
  free: number;
  used: number;
  total: number;
}

export interface Ticker {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  high: number;
  low: number;
  volume: number;
  percentage: number;
  timestamp: number;
}

export interface OrderRequest {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  price?: number;
}

export interface OrderResult {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  fee: number;
  timestamp: number;
}

export type MarketRegime =
  | "trending_up"
  | "trending_down"
  | "ranging"
  | "volatile";
