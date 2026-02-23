import type { Strategy } from "@/types/strategy";
import { getDb } from "@/lib/db";

// A: Mean Reversion (4)
import { RSIBBStrategy } from "./mean-reversion/rsi-bb";
import { VWAPReversionStrategy } from "./mean-reversion/vwap-reversion";
import { WilliamsBBStrategy } from "./mean-reversion/williams-bb";
import { VolumeProfileStrategy } from "./mean-reversion/volume-profile";

// B: Trend Following (5)
import { EMACrossoverStrategy } from "./trend-following/ema-crossover";
import { SuperTrendMFIStrategy } from "./trend-following/supertrend-mfi";
import { PSARADXStrategy } from "./trend-following/psar-adx";
import { MultiTFEMAStrategy } from "./trend-following/multi-tf-ema";
import { IchimokuBounceStrategy } from "./trend-following/ichimoku-bounce";

// C: Breakout (3)
import { SupportResistanceStrategy } from "./breakout/support-resistance";
import { KeltnerBreakoutStrategy } from "./breakout/keltner-breakout";
import { DonchianBreakoutStrategy } from "./breakout/donchian-breakout";

// D: Momentum (4)
import { MACDRSIStrategy } from "./momentum/macd-rsi";
import { StochRSIMAStrategy } from "./momentum/stochrsi-ma";
import { MomentumBurstStrategy } from "./momentum/momentum-burst";
import { CCIDivergenceStrategy } from "./momentum/cci-divergence";

// E: Divergence (2)
import { OBVDivergenceStrategy } from "./divergence/obv-divergence";
import { HiddenDivergenceStrategy } from "./divergence/hidden-divergence";

// 전략 레지스트리: 18개 전략 인스턴스 (order-flow 2개 제외)
const strategies: Strategy[] = [
  // A: Mean Reversion
  new RSIBBStrategy(),
  new VWAPReversionStrategy(),
  new WilliamsBBStrategy(),
  new VolumeProfileStrategy(),
  // B: Trend Following
  new EMACrossoverStrategy(),
  new SuperTrendMFIStrategy(),
  new PSARADXStrategy(),
  new MultiTFEMAStrategy(),
  new IchimokuBounceStrategy(),
  // C: Breakout
  new SupportResistanceStrategy(),
  new KeltnerBreakoutStrategy(),
  new DonchianBreakoutStrategy(),
  // D: Momentum
  new MACDRSIStrategy(),
  new StochRSIMAStrategy(),
  new MomentumBurstStrategy(),
  new CCIDivergenceStrategy(),
  // E: Divergence
  new OBVDivergenceStrategy(),
  new HiddenDivergenceStrategy(),
];

const strategyMap = new Map<string, Strategy>(
  strategies.map((s) => [s.config.id, s])
);

export function getStrategy(id: string): Strategy | undefined {
  return strategyMap.get(id);
}

export function getAllStrategies(): Strategy[] {
  return strategies;
}

export function getStrategiesByCategory(category: string): Strategy[] {
  return strategies.filter((s) => s.config.category === category);
}

/** DB에서 enabled=1인 전략만 반환 */
export function getEnabledStrategies(): Strategy[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT strategy_id FROM strategy_configs WHERE enabled = 1"
  ).all() as { strategy_id: string }[];

  if (rows.length === 0) {
    // 설정이 아직 없으면 전체 반환
    return strategies;
  }

  const enabledIds = new Set(rows.map((r) => r.strategy_id));
  return strategies.filter((s) => enabledIds.has(s.config.id));
}
