import type { Indicator } from "@/types/indicator";
import { RSIIndicator, MACDIndicator, StochRSIIndicator, CCIIndicator, WilliamsRIndicator, MFIIndicator, ElderRayIndicator } from "./momentum";
import { EMAIndicator, ADXIndicator, PSARIndicator, SuperTrendIndicator, DonchianIndicator } from "./trend";
import { BollingerBandsIndicator, ATRIndicator, KeltnerChannelIndicator } from "./volatility";
import { VWAPIndicator, OBVIndicator, CMFIndicator, CVDIndicator, VolumeProfileIndicator } from "./volume";
import { IchimokuIndicator } from "./composite";

const indicators: Indicator[] = [
  // Momentum
  new RSIIndicator(),
  new MACDIndicator(),
  new StochRSIIndicator(),
  new CCIIndicator(),
  new WilliamsRIndicator(),
  new MFIIndicator(),
  new ElderRayIndicator(),
  // Trend
  new EMAIndicator(),
  new ADXIndicator(),
  new PSARIndicator(),
  new SuperTrendIndicator(),
  new DonchianIndicator(),
  // Volatility
  new BollingerBandsIndicator(),
  new ATRIndicator(),
  new KeltnerChannelIndicator(),
  // Volume
  new VWAPIndicator(),
  new OBVIndicator(),
  new CMFIndicator(),
  new CVDIndicator(),
  new VolumeProfileIndicator(),
  // Composite
  new IchimokuIndicator(),
];

const indicatorMap = new Map<string, Indicator>(
  indicators.map((ind) => [ind.id, ind])
);

export function getIndicator(id: string): Indicator | undefined {
  return indicatorMap.get(id);
}

export function getAllIndicators(): Indicator[] {
  return indicators;
}

export * from "./momentum";
export * from "./trend";
export * from "./volatility";
export * from "./volume";
export * from "./composite";
