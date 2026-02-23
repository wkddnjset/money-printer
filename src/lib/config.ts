import type { Symbol, Timeframe } from "@/types/candle";
import type { RiskConfig } from "@/types/risk";
import type { StrategyCategory } from "@/types/strategy";

export const chainConfig = {
  rpcUrl: `https://worldchain-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY ?? ""}`,
  chainId: 480,
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY ?? "",
  tokens: {
    WLD: (process.env.WLD_TOKEN_ADDRESS ?? "0x2cFc85d8E48F8EAB294be644d9E25C3030863003") as `0x${string}`,
    USDC: (process.env.USDC_TOKEN_ADDRESS ?? "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1") as `0x${string}`,
    WETH: (process.env.WETH_TOKEN_ADDRESS ?? "0x4200000000000000000000000000000000000006") as `0x${string}`,
  },
  uniswapRouter: (process.env.UNISWAP_ROUTER ?? "0x091AD9e2e6e5eD44c1c66dB50e49A601F9f36cF6") as `0x${string}`,
  uniswapQuoter: (process.env.UNISWAP_QUOTER ?? "0x10158D43e6cc414deE1Bd1eB0EfC6a5cBCfF244c") as `0x${string}`,
  wldUsdcPool: (process.env.WLD_USDC_POOL ?? "0x610e319b3a3ab56a0ed5562927d37c233774ba39") as `0x${string}`,
};

export const tradingConfig = {
  symbol: (process.env.DEFAULT_SYMBOL ?? "WLD/USDC") as Symbol,
  timeframe: (process.env.DEFAULT_TIMEFRAME ?? "1m") as Timeframe,
  paperMode: process.env.PAPER_MODE !== "false",
  paperInitialBalance: Number(process.env.PAPER_INITIAL_BALANCE ?? 10000),
  /** 스캘핑 틱 간격 (초). 캔들 타임프레임과 무관하게 이 간격으로 전략 분석 */
  scalpingTickSeconds: Number(process.env.SCALPING_TICK_SECONDS ?? 5),
  /** 캔들 데이터 캐시 TTL (초). API 부하 방지 */
  candleCacheTtlSeconds: 30,
  /** 전략당 최대 진입 횟수 (멀티엔트리) */
  maxEntriesPerStrategy: 4,
  /** 각 진입별 배분금 비율 (합계 = 1.0) */
  entrySizeWeights: [0.20, 0.25, 0.25, 0.30] as readonly number[],
  /** 동일 전략 연속 매수 쿨다운 (초) */
  entryMinCooldownSeconds: 30,
};

/** 기본 리스크 설정 (폴백용) */
export const riskConfig: RiskConfig = {
  stopLossPercent: 3.0,
  takeProfitPercent: 5.0,
  maxPositionPercent: 80.0,
  maxDailyLossPercent: 10.0,
  maxDrawdownPercent: 25.0,
  maxConsecutiveLosses: 10,
  consecutiveLossReduction: 0.7,
};

/**
 * 전략 카테고리별 리스크 프로파일
 * - 하루 전략당 1~2회 매매 기준
 * - WLD 일일 변동성 5~10% 고려, 충분히 들고 있는 구조
 * - SL 넓게 → 노이즈에 흔들리지 않음
 * - TP는 SL 대비 1.5~2배 → 손익비 유리
 */
export const categoryRiskConfig: Record<StrategyCategory, RiskConfig> = {
  "mean-reversion": {
    stopLossPercent: 2.5,      // 평균 회귀 대기, 넉넉한 여유
    takeProfitPercent: 3.5,    // 평균으로 복귀 시 수익 실현
    maxPositionPercent: 85.0,
    maxDailyLossPercent: 10.0,
    maxDrawdownPercent: 25.0,
    maxConsecutiveLosses: 10,
    consecutiveLossReduction: 0.7,
  },
  "trend-following": {
    stopLossPercent: 4.0,      // 추세 흔들림 버티기
    takeProfitPercent: 8.0,    // 추세 타고 크게 수익
    maxPositionPercent: 80.0,
    maxDailyLossPercent: 10.0,
    maxDrawdownPercent: 25.0,
    maxConsecutiveLosses: 10,
    consecutiveLossReduction: 0.7,
  },
  "breakout": {
    stopLossPercent: 3.0,      // 돌파 실패 대비
    takeProfitPercent: 6.0,    // 돌파 성공 시 크게
    maxPositionPercent: 80.0,
    maxDailyLossPercent: 10.0,
    maxDrawdownPercent: 25.0,
    maxConsecutiveLosses: 10,
    consecutiveLossReduction: 0.7,
  },
  "momentum": {
    stopLossPercent: 3.0,      // 모멘텀 전환 대비
    takeProfitPercent: 5.0,    // 모멘텀 타고 수익
    maxPositionPercent: 85.0,
    maxDailyLossPercent: 10.0,
    maxDrawdownPercent: 25.0,
    maxConsecutiveLosses: 10,
    consecutiveLossReduction: 0.7,
  },
  "divergence": {
    stopLossPercent: 3.5,      // 다이버전스 전개 시간 필요
    takeProfitPercent: 7.0,    // 전개되면 큰 수익
    maxPositionPercent: 80.0,
    maxDailyLossPercent: 10.0,
    maxDrawdownPercent: 25.0,
    maxConsecutiveLosses: 10,
    consecutiveLossReduction: 0.7,
  },
  "order-flow": {
    stopLossPercent: 2.0,      // 주문흐름은 비교적 빠른 반응
    takeProfitPercent: 3.0,    // 짧은 수익 실현
    maxPositionPercent: 90.0,
    maxDailyLossPercent: 10.0,
    maxDrawdownPercent: 25.0,
    maxConsecutiveLosses: 10,
    consecutiveLossReduction: 0.7,
  },
};

/** 전략 카테고리로 리스크 설정 가져오기 */
export function getRiskForCategory(category: StrategyCategory): RiskConfig {
  return categoryRiskConfig[category] ?? riskConfig;
}
