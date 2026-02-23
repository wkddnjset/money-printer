# Design: 코인 초단타 로보어드바이저 (Crypto Scalping Robo-Advisor)

> 작성일: 2026-02-22
> 상태: Draft
> Plan 참조: `docs/01-plan/features/crypto-scalping-robo-advisor.plan.md`

---

## 1. 프로젝트 구조

### 1.1 디렉토리 구조

```
money-printer/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # 루트 레이아웃 (사이드바 + 헤더)
│   │   ├── page.tsx                  # 메인 대시보드 (/)
│   │   ├── strategies/
│   │   │   └── page.tsx              # 전략 관리 (/strategies)
│   │   ├── trades/
│   │   │   └── page.tsx              # 거래 내역 (/trades)
│   │   ├── analytics/
│   │   │   └── page.tsx              # 수익 분석 (/analytics)
│   │   ├── backtest/
│   │   │   └── page.tsx              # 백테스트 결과 (/backtest)
│   │   ├── settings/
│   │   │   └── page.tsx              # 설정 (/settings)
│   │   └── api/                      # API Routes
│   │       ├── exchange/
│   │       │   ├── balance/route.ts      # 잔고 조회
│   │       │   ├── ticker/route.ts       # 현재가 조회
│   │       │   └── order/route.ts        # 주문 실행
│   │       ├── strategies/
│   │       │   ├── route.ts              # 전략 목록/설정 CRUD
│   │       │   └── signals/route.ts      # 현재 신호 조회
│   │       ├── trades/
│   │       │   └── route.ts              # 거래 내역 CRUD
│   │       ├── analytics/
│   │       │   └── route.ts              # 수익 통계 조회
│   │       ├── backtest/
│   │       │   ├── route.ts              # 백테스트 실행/결과
│   │       │   └── history/route.ts      # 리밸런싱 이력
│   │       ├── engine/
│   │       │   ├── start/route.ts        # 엔진 시작
│   │       │   ├── stop/route.ts         # 엔진 중지
│   │       │   └── status/route.ts       # 엔진 상태
│   │       └── ws/route.ts              # WebSocket 프록시
│   │
│   ├── components/                   # React 컴포넌트
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx               # 사이드바 내비게이션
│   │   │   ├── Header.tsx                # 상단 헤더 (잔고, 엔진 상태)
│   │   │   └── StatusBar.tsx             # 하단 상태바 (연결, 수익)
│   │   ├── chart/
│   │   │   ├── CandlestickChart.tsx      # TradingView 캔들스틱
│   │   │   ├── IndicatorOverlay.tsx      # 지표 오버레이 관리
│   │   │   └── OrderBookChart.tsx        # 호가창 시각화
│   │   ├── strategy/
│   │   │   ├── StrategyCard.tsx          # 전략 카드 (ON/OFF, 가중치)
│   │   │   ├── StrategyList.tsx          # 전략 목록 (카테고리별)
│   │   │   ├── SignalBadge.tsx           # 매수/매도/대기 신호 뱃지
│   │   │   └── StrategyDetail.tsx        # 전략 상세 설명 모달
│   │   ├── trade/
│   │   │   ├── TradeTable.tsx            # 거래 내역 테이블
│   │   │   ├── TradeFilters.tsx          # 필터 (날짜, 전략, 수익)
│   │   │   └── ActivePositions.tsx       # 현재 열린 포지션
│   │   ├── analytics/
│   │   │   ├── PnLChart.tsx              # 수익/손실 차트
│   │   │   ├── StrategyComparison.tsx    # 전략별 성과 비교
│   │   │   └── DailyReturns.tsx          # 일별 수익률
│   │   ├── backtest/
│   │   │   ├── BacktestResults.tsx       # 백테스트 결과 테이블
│   │   │   ├── ParameterHistory.tsx      # 파라미터 변경 히스토리
│   │   │   └── WalkForwardChart.tsx      # 워크포워드 통과율 차트
│   │   └── common/
│   │       ├── Card.tsx                  # 공통 카드 컴포넌트
│   │       ├── Badge.tsx                 # 뱃지 (상태 표시)
│   │       ├── Tooltip.tsx               # 초보자용 툴팁 설명
│   │       └── LoadingSpinner.tsx        # 로딩 표시
│   │
│   ├── engine/                       # 트레이딩 엔진 (핵심 비즈니스 로직)
│   │   ├── TradingEngine.ts              # 엔진 메인 클래스 (싱글톤)
│   │   ├── ExchangeConnector.ts          # 거래소 연결 관리 (ccxt)
│   │   ├── WebSocketManager.ts           # WebSocket 실시간 데이터
│   │   ├── indicators/                   # 기술적 지표 계산
│   │   │   ├── index.ts                  # 지표 팩토리
│   │   │   ├── base.ts                   # 지표 기본 인터페이스
│   │   │   ├── trend.ts                  # EMA, ADX, PSAR, SuperTrend, Aroon, 피보나치, 피봇
│   │   │   ├── momentum.ts              # RSI, MACD, StochRSI, CCI, WilliamsR, RVI, ElderRay
│   │   │   ├── volatility.ts            # BB, ATR, 켈트너, 돈치안
│   │   │   ├── volume.ts                # VWAP, MFI, OBV, CMF, CVD, VolumeProfile
│   │   │   └── composite.ts             # 이치모쿠
│   │   ├── strategies/                   # 20개 전략 구현
│   │   │   ├── index.ts                  # 전략 레지스트리
│   │   │   ├── base.ts                   # 전략 기본 인터페이스
│   │   │   ├── mean-reversion/           # 카테고리 A: 평균회귀
│   │   │   │   ├── rsi-bb.ts             # #1 RSI + 볼린저밴드
│   │   │   │   ├── vwap-reversion.ts     # #2 VWAP 평균회귀
│   │   │   │   ├── williams-bb.ts        # #3 Williams %R + BB
│   │   │   │   └── volume-profile.ts     # #4 Volume Profile 회귀
│   │   │   ├── trend-following/          # 카테고리 B: 추세추종
│   │   │   │   ├── ema-crossover.ts      # #5 EMA 크로스오버
│   │   │   │   ├── supertrend-mfi.ts     # #6 SuperTrend + MFI
│   │   │   │   ├── psar-adx.ts           # #7 PSAR + ADX
│   │   │   │   ├── multi-tf-ema.ts       # #8 멀티 타임프레임 EMA
│   │   │   │   └── ichimoku-bounce.ts    # #9 이치모쿠 바운스
│   │   │   ├── breakout/                 # 카테고리 C: 돌파
│   │   │   │   ├── support-resistance.ts # #10 지지/저항 돌파
│   │   │   │   ├── keltner-breakout.ts   # #11 켈트너 채널 돌파
│   │   │   │   └── donchian-breakout.ts  # #12 돈치안 돌파
│   │   │   ├── momentum/                 # 카테고리 D: 모멘텀
│   │   │   │   ├── macd-rsi.ts           # #13 MACD + RSI
│   │   │   │   ├── stochrsi-ma.ts        # #14 StochRSI + MA
│   │   │   │   ├── momentum-burst.ts     # #15 모멘텀 버스트
│   │   │   │   └── cci-divergence.ts     # #16 CCI 다이버전스
│   │   │   ├── divergence/               # 카테고리 E: 다이버전스
│   │   │   │   ├── obv-divergence.ts     # #17 OBV 다이버전스
│   │   │   │   └── hidden-divergence.ts  # #18 히든 다이버전스
│   │   │   └── order-flow/               # 카테고리 F: 주문흐름
│   │   │       ├── orderbook-imbalance.ts# #19 호가창 불균형
│   │   │       └── spread-scalping.ts    # #20 스프레드 스캘핑
│   │   ├── signal/
│   │   │   ├── SignalAggregator.ts       # 20개 전략 신호 가중 합산
│   │   │   └── SignalTypes.ts            # 신호 타입 정의
│   │   ├── risk/
│   │   │   ├── RiskManager.ts            # 리스크 관리 메인
│   │   │   ├── PositionSizer.ts          # 포지션 사이즈 계산
│   │   │   └── DrawdownMonitor.ts        # 드로다운 모니터링
│   │   ├── executor/
│   │   │   ├── OrderExecutor.ts          # 주문 실행
│   │   │   └── PaperTrader.ts            # 페이퍼 트레이딩 모드
│   │   ├── optimizer/
│   │   │   ├── RealtimeOptimizer.ts      # 실시간 미세 조정
│   │   │   ├── RegimeDetector.ts         # 시장 상태 감지
│   │   │   └── WeightAdjuster.ts         # 전략 가중치 조정
│   │   ├── backtest/
│   │   │   ├── BacktestEngine.ts         # 백테스트 엔진
│   │   │   ├── GridSearch.ts             # 파라미터 그리드 서치
│   │   │   ├── WalkForward.ts            # 워크포워드 검증
│   │   │   └── DailyRebalancer.ts        # 00:00 UTC 스케줄러
│   │   └── data/
│   │       ├── CandleStore.ts            # 캔들 데이터 저장/관리
│   │       └── HistoricalDataFetcher.ts  # 과거 데이터 수집
│   │
│   ├── lib/                          # 유틸리티
│   │   ├── db.ts                         # SQLite 연결 (better-sqlite3)
│   │   ├── config.ts                     # 설정 관리
│   │   └── logger.ts                     # 로그 관리
│   │
│   └── types/                        # TypeScript 타입
│       ├── candle.ts                     # OHLCV 캔들 타입
│       ├── indicator.ts                  # 지표 타입
│       ├── strategy.ts                   # 전략 타입
│       ├── signal.ts                     # 신호 타입
│       ├── trade.ts                      # 거래 타입
│       ├── risk.ts                       # 리스크 타입
│       └── exchange.ts                   # 거래소 타입
│
├── data/
│   └── money-printer.db             # SQLite 데이터베이스 파일
│
├── public/                           # 정적 파일
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
└── .env.local                        # API 키 (gitignore 대상)
```

---

## 2. 데이터베이스 스키마 (SQLite)

### 2.1 ERD 개요

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   candles    │     │   trades     │     │ strategy_configs │
│──────────────│     │──────────────│     │──────────────────│
│ symbol       │     │ id           │     │ strategy_id (PK) │
│ timeframe    │     │ strategy_id  │────▶│ name             │
│ timestamp(PK)│     │ side         │     │ category         │
│ open         │     │ entry_price  │     │ enabled          │
│ high         │     │ exit_price   │     │ weight           │
│ low          │     │ quantity     │     │ parameters (JSON)│
│ close        │     │ pnl          │     │ updated_at       │
│ volume       │     │ fee          │     └──────────────────┘
└──────────────┘     │ created_at   │
                     └──────────────┘     ┌──────────────────┐
                                          │ backtest_results │
┌──────────────────┐                      │──────────────────│
│ rebalance_log    │                      │ id               │
│──────────────────│                      │ strategy_id      │
│ id               │                      │ timeframe        │
│ executed_at      │                      │ period_start     │
│ strategy_id      │                      │ period_end       │
│ change_type      │                      │ win_rate         │
│ old_value (JSON) │                      │ total_return     │
│ new_value (JSON) │                      │ max_drawdown     │
│ reason           │                      │ sharpe_ratio     │
└──────────────────┘                      │ trade_count      │
                                          │ parameters (JSON)│
┌──────────────────┐                      │ created_at       │
│ engine_state     │                      └──────────────────┘
│──────────────────│
│ key (PK)         │     ┌──────────────────┐
│ value (JSON)     │     │ daily_performance│
│ updated_at       │     │──────────────────│
└──────────────────┘     │ date (PK)        │
                          │ starting_balance │
                          │ ending_balance   │
                          │ total_pnl        │
                          │ trade_count      │
                          │ win_count        │
                          │ regime           │
                          └──────────────────┘
```

### 2.2 테이블 상세

#### candles — 캔들(시세) 데이터 캐시

```sql
CREATE TABLE candles (
  symbol      TEXT    NOT NULL,  -- 'WLD/USDC', 'ETH/USDC', 'SOL/USDC'
  timeframe   TEXT    NOT NULL,  -- '1m', '5m', '15m'
  timestamp   INTEGER NOT NULL,  -- Unix timestamp (ms)
  open        REAL    NOT NULL,
  high        REAL    NOT NULL,
  low         REAL    NOT NULL,
  close       REAL    NOT NULL,
  volume      REAL    NOT NULL,
  PRIMARY KEY (symbol, timeframe, timestamp)
);

CREATE INDEX idx_candles_lookup ON candles(symbol, timeframe, timestamp DESC);
```

#### trades — 거래 내역

```sql
CREATE TABLE trades (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id   TEXT    NOT NULL,  -- 'rsi-bb', 'ema-crossover' 등
  symbol        TEXT    NOT NULL,  -- 'WLD/USDC'
  side          TEXT    NOT NULL,  -- 'buy' | 'sell'
  entry_price   REAL    NOT NULL,
  exit_price    REAL,              -- NULL이면 아직 열린 포지션
  quantity      REAL    NOT NULL,  -- 매매 수량
  pnl           REAL,              -- 실현 손익 (USDC)
  pnl_percent   REAL,              -- 실현 손익 (%)
  fee           REAL    NOT NULL DEFAULT 0,
  is_paper      INTEGER NOT NULL DEFAULT 0,  -- 페이퍼 트레이딩 여부
  signal_data   TEXT,              -- 신호 발생 시점의 지표 스냅샷 (JSON)
  entry_at      INTEGER NOT NULL,  -- 진입 시각
  exit_at       INTEGER,           -- 퇴출 시각
  created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX idx_trades_strategy ON trades(strategy_id, created_at DESC);
CREATE INDEX idx_trades_date ON trades(created_at DESC);
```

#### strategy_configs — 전략 설정

```sql
CREATE TABLE strategy_configs (
  strategy_id   TEXT    PRIMARY KEY,  -- 'rsi-bb', 'ema-crossover' 등
  name          TEXT    NOT NULL,     -- 'RSI + 볼린저밴드'
  category      TEXT    NOT NULL,     -- 'mean-reversion' | 'trend-following' | ...
  difficulty    TEXT    NOT NULL,     -- 'beginner' | 'intermediate' | 'advanced'
  enabled       INTEGER NOT NULL DEFAULT 0,
  weight        REAL    NOT NULL DEFAULT 1.0,  -- 가중치 (0.0 ~ 5.0)
  parameters    TEXT    NOT NULL,     -- JSON: 전략별 파라미터
  description   TEXT,                -- 초보자용 설명
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
```

#### backtest_results — 백테스트 결과

```sql
CREATE TABLE backtest_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id   TEXT    NOT NULL,
  timeframe     TEXT    NOT NULL,
  period_start  INTEGER NOT NULL,  -- 테스트 시작 시각
  period_end    INTEGER NOT NULL,  -- 테스트 종료 시각
  win_rate      REAL    NOT NULL,  -- 승률 (0.0 ~ 1.0)
  total_return  REAL    NOT NULL,  -- 총 수익률 (%)
  max_drawdown  REAL    NOT NULL,  -- 최대 드로다운 (%)
  sharpe_ratio  REAL,              -- 샤프 비율
  trade_count   INTEGER NOT NULL,  -- 거래 횟수
  avg_trade_pnl REAL,              -- 평균 거래 수익
  parameters    TEXT    NOT NULL,  -- 사용된 파라미터 (JSON)
  walk_forward_pass INTEGER,       -- 워크포워드 통과 여부 (1/0/NULL)
  created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX idx_backtest_strategy ON backtest_results(strategy_id, created_at DESC);
```

#### rebalance_log — 리밸런싱 변경 이력

```sql
CREATE TABLE rebalance_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  executed_at   INTEGER NOT NULL,  -- 리밸런싱 실행 시각
  strategy_id   TEXT    NOT NULL,
  change_type   TEXT    NOT NULL,  -- 'parameter' | 'weight' | 'enabled' | 'risk'
  old_value     TEXT    NOT NULL,  -- 이전 값 (JSON)
  new_value     TEXT    NOT NULL,  -- 새 값 (JSON)
  reason        TEXT    NOT NULL   -- 변경 사유
);

CREATE INDEX idx_rebalance_date ON rebalance_log(executed_at DESC);
```

#### daily_performance — 일별 성과

```sql
CREATE TABLE daily_performance (
  date             TEXT    PRIMARY KEY,  -- 'YYYY-MM-DD'
  starting_balance REAL    NOT NULL,
  ending_balance   REAL    NOT NULL,
  total_pnl        REAL    NOT NULL,
  trade_count      INTEGER NOT NULL,
  win_count        INTEGER NOT NULL,
  best_strategy    TEXT,                -- 최고 성과 전략 ID
  worst_strategy   TEXT,                -- 최저 성과 전략 ID
  regime           TEXT                 -- 'trending_up' | 'trending_down' | 'ranging' | 'volatile'
);
```

#### engine_state — 엔진 상태 (Key-Value)

```sql
CREATE TABLE engine_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,      -- JSON
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- 저장하는 상태:
-- 'engine_running'  → {"running": true, "started_at": 1708646400000}
-- 'current_regime'  → {"regime": "ranging", "confidence": 0.78}
-- 'paper_mode'      → {"enabled": true}
-- 'last_rebalance'  → {"executed_at": ..., "duration_ms": ...}
-- 'risk_state'      → {"daily_loss": -1.2, "consecutive_losses": 1}
```

---

## 3. 핵심 인터페이스 설계

### 3.1 캔들 데이터 타입

```typescript
// src/types/candle.ts
interface OHLCV {
  timestamp: number;   // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Timeframe = '1m' | '3m' | '5m' | '15m';
type Symbol = 'WLD/USDC' | 'ETH/USDC' | 'SOL/USDC';
```

### 3.2 지표 인터페이스

```typescript
// src/engine/indicators/base.ts
interface IndicatorConfig {
  id: string;           // 'rsi', 'macd', 'bb' 등
  category: 'trend' | 'momentum' | 'volatility' | 'volume' | 'composite';
  parameters: Record<string, number>;  // { period: 14 } 등
}

interface IndicatorResult {
  indicatorId: string;
  timestamp: number;
  values: Record<string, number>;  // { value: 35.5 } 또는 { upper: 2.1, middle: 2.0, lower: 1.9 }
}

interface Indicator {
  readonly id: string;
  readonly category: string;
  calculate(candles: OHLCV[], params: Record<string, number>): IndicatorResult[];
}
```

### 3.3 전략 인터페이스 (핵심)

```typescript
// src/engine/strategies/base.ts
type SignalAction = 'buy' | 'sell' | 'hold';
type StrategyCategory = 'mean-reversion' | 'trend-following' | 'breakout'
                       | 'momentum' | 'divergence' | 'order-flow';
type Difficulty = 'beginner' | 'intermediate' | 'advanced';

interface StrategySignal {
  action: SignalAction;
  confidence: number;    // 0.0 ~ 1.0 (신호 확신도)
  strategyId: string;
  reason: string;        // 사람이 읽을 수 있는 사유
  indicators: Record<string, number>;  // 신호 시점 지표값 스냅샷
  timestamp: number;
}

interface StrategyConfig {
  id: string;
  name: string;
  category: StrategyCategory;
  difficulty: Difficulty;
  description: string;          // 초보자용 설명
  defaultParameters: Record<string, number>;
  parameterRanges: Record<string, { min: number; max: number; step: number }>;
  requiredIndicators: string[]; // 필요한 지표 ID 목록
  recommendedTimeframes: Timeframe[];
}

interface Strategy {
  readonly config: StrategyConfig;
  analyze(candles: OHLCV[], params: Record<string, number>): StrategySignal;
}
```

### 3.4 신호 합산 인터페이스

```typescript
// src/engine/signal/SignalAggregator.ts
interface AggregatedSignal {
  finalAction: SignalAction;      // 최종 결정
  buyScore: number;               // 매수 점수 합계
  sellScore: number;              // 매도 점수 합계
  totalWeight: number;            // 참여한 전략의 총 가중치
  strategySignals: StrategySignal[];  // 개별 전략 신호 목록
  timestamp: number;
}

// 합산 로직:
// 1. 각 전략의 signal.confidence × strategy.weight 로 점수 계산
// 2. 'buy' 신호 → buyScore에 합산, 'sell' 신호 → sellScore에 합산
// 3. buyScore > sellScore × 1.2 → 최종 'buy'
//    sellScore > buyScore × 1.2 → 최종 'sell'
//    그 외 → 'hold'
// 4. 최소 2개 이상의 전략이 같은 방향일 때만 실행 (확인 필터)
```

### 3.5 리스크 관리 인터페이스

```typescript
// src/engine/risk/RiskManager.ts
interface RiskConfig {
  stopLossPercent: number;        // 기본 1.0%
  takeProfitPercent: number;      // 기본 1.5%
  maxPositionPercent: number;     // 기본 5.0% (총자산 대비)
  maxDailyLossPercent: number;    // 기본 3.0%
  maxDrawdownPercent: number;     // 기본 15.0%
  maxConsecutiveLosses: number;   // 기본 3
  consecutiveLossReduction: number; // 기본 0.5 (50% 축소)
}

interface RiskCheck {
  allowed: boolean;
  reason?: string;            // 거부 시 사유
  adjustedQuantity?: number;  // 조정된 수량
  stopLoss: number;           // 계산된 손절가
  takeProfit: number;         // 계산된 익절가
}

// RiskManager.checkOrder(signal, balance, currentATR) → RiskCheck
```

### 3.6 백테스트 인터페이스

```typescript
// src/engine/backtest/BacktestEngine.ts
interface BacktestConfig {
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

interface BacktestResult {
  strategyId: string;
  winRate: number;
  totalReturn: number;          // %
  maxDrawdown: number;          // %
  sharpeRatio: number;
  tradeCount: number;
  avgTradePnl: number;
  profitFactor: number;         // 총이익 / 총손실
  trades: BacktestTrade[];      // 개별 거래 목록
}

// GridSearch
interface GridSearchConfig {
  strategyId: string;
  parameterGrid: Record<string, number[]>;  // { rsiPeriod: [7, 10, 14], bbPeriod: [15, 20] }
  optimizeFor: 'sharpe' | 'return' | 'winRate';
}

// WalkForward
interface WalkForwardConfig {
  inSampleRatio: number;        // 기본 0.7 (70% 학습)
  outSampleRatio: number;       // 기본 0.3 (30% 검증)
  minPassRatio: number;         // 기본 0.5 (검증이 학습의 50% 이상)
}
```

### 3.7 시장 상태 감지

```typescript
// src/engine/optimizer/RegimeDetector.ts
type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';

interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number;         // 0.0 ~ 1.0
  indicators: {
    adx: number;              // 추세 강도
    atr: number;              // 변동성
    atrRatio: number;         // 현재 ATR / 평균 ATR
    trendDirection: number;   // +1 상승, -1 하락, 0 횡보
  };
  recommendedCategories: StrategyCategory[];
}

// 판별 로직:
// ADX > 25 + 방향성 → trending_up / trending_down
// ADX < 20 + ATR 낮음 → ranging
// ADX < 20 + ATR 높음 → volatile
```

---

## 4. API 설계

### 4.1 API 엔드포인트 목록

| Method | Endpoint | 설명 |
|--------|----------|------|
| **거래소** | | |
| GET | `/api/exchange/balance` | 잔고 조회 (USDC, WLD, ETH, SOL) |
| GET | `/api/exchange/ticker?symbol=WLD/USDC` | 현재가 |
| POST | `/api/exchange/order` | 주문 실행 |
| **전략** | | |
| GET | `/api/strategies` | 전략 목록 + 설정 |
| PATCH | `/api/strategies` | 전략 설정 변경 (enabled, weight, params) |
| GET | `/api/strategies/signals` | 현재 20개 전략의 신호 상태 |
| **거래** | | |
| GET | `/api/trades?page=1&limit=50&strategy=rsi-bb` | 거래 내역 |
| **분석** | | |
| GET | `/api/analytics?period=7d` | 수익 통계 |
| **백테스트** | | |
| POST | `/api/backtest` | 수동 백테스트 실행 |
| GET | `/api/backtest?strategyId=rsi-bb` | 최근 백테스트 결과 |
| GET | `/api/backtest/history?days=30` | 리밸런싱 변경 이력 |
| **엔진** | | |
| POST | `/api/engine/start` | 자동매매 시작 |
| POST | `/api/engine/stop` | 자동매매 중지 |
| GET | `/api/engine/status` | 엔진 상태 (실행중/중지, 페이퍼모드, 현재 레짐) |

### 4.2 주요 API 응답 예시

#### GET /api/strategies/signals

```json
{
  "timestamp": 1708646400000,
  "regime": { "type": "ranging", "confidence": 0.78 },
  "aggregated": {
    "finalAction": "buy",
    "buyScore": 3.8,
    "sellScore": 1.2,
    "confidence": 0.76
  },
  "strategies": [
    {
      "id": "rsi-bb",
      "name": "RSI + 볼린저밴드",
      "enabled": true,
      "weight": 1.5,
      "signal": {
        "action": "buy",
        "confidence": 0.82,
        "reason": "RSI 28.5 (과매도) + 가격이 하단밴드 터치"
      }
    },
    {
      "id": "ema-crossover",
      "name": "EMA 크로스오버",
      "enabled": true,
      "weight": 1.0,
      "signal": {
        "action": "hold",
        "confidence": 0.45,
        "reason": "9 EMA와 21 EMA 교차 없음"
      }
    }
  ]
}
```

#### GET /api/engine/status

```json
{
  "running": true,
  "paperMode": true,
  "uptime": 86400000,
  "regime": "ranging",
  "balance": { "USDC": 9850.50, "WLD": 125.3 },
  "todayPnl": { "amount": -149.50, "percent": -1.49 },
  "openPositions": 1,
  "totalTradesToday": 12,
  "winRateToday": 0.58,
  "lastRebalance": {
    "executedAt": 1708646400000,
    "changesCount": 4,
    "nextScheduled": 1708732800000
  }
}
```

---

## 5. 트레이딩 엔진 상세 설계

### 5.1 엔진 라이프사이클

```
┌─────────────────────────────────────────────────────────┐
│                  TradingEngine (싱글톤)                    │
│                                                          │
│  init()                                                  │
│  ├── DB 초기화 (SQLite 테이블 생성)                        │
│  ├── 전략 로드 (strategy_configs → Strategy 인스턴스)      │
│  ├── ExchangeConnector 초기화 (ccxt, API 키 검증)         │
│  └── WebSocketManager 초기화 (실시간 데이터 구독)           │
│                                                          │
│  start()                                                 │
│  ├── WebSocket 연결 시작                                  │
│  ├── 메인 루프 시작 (onCandleClose 이벤트 기반)            │
│  └── DailyRebalancer 스케줄 등록 (node-cron)              │
│                                                          │
│  onCandleClose(candle)    ← 매 캔들 마감 시 실행          │
│  ├── 1. 지표 계산 (18개 지표 업데이트)                     │
│  ├── 2. 전략 분석 (활성화된 전략만 → StrategySignal[])    │
│  ├── 3. 신호 합산 (SignalAggregator → AggregatedSignal)  │
│  ├── 4. 리스크 체크 (RiskManager → RiskCheck)            │
│  ├── 5. 주문 실행 (OrderExecutor 또는 PaperTrader)       │
│  ├── 6. 거래 기록 (SQLite)                               │
│  └── 7. 실시간 최적화 체크 (RealtimeOptimizer)           │
│                                                          │
│  stop()                                                  │
│  ├── 열린 포지션 처리 (설정에 따라 유지/정리)              │
│  ├── WebSocket 연결 종료                                  │
│  └── 상태 저장                                           │
└─────────────────────────────────────────────────────────┘
```

### 5.2 메인 트레이딩 루프 상세

```
매 캔들 마감 시 (기본: 5분봉):

[Step 1] 지표 계산
  candles (최근 200개) → IndicatorEngine.calculateAll()
  → { rsi: 28.5, macd: {...}, bb: {...}, ema9: 2.15, ... }

[Step 2] 전략 분석 (enabled 전략만, 병렬 처리)
  indicatorValues → strategy[i].analyze(candles, params)
  → StrategySignal[] (action, confidence, reason)

[Step 3] 신호 합산
  signals × weights → SignalAggregator.aggregate()
  → AggregatedSignal { finalAction: 'buy', buyScore: 3.8, ... }

[Step 4] 리스크 체크
  aggregatedSignal → RiskManager.check()
  ├── 일일 손실 한도 체크
  ├── 최대 드로다운 체크
  ├── 연속 손실 체크
  ├── 포지션 사이즈 계산
  └── 손절/익절 가격 계산
  → RiskCheck { allowed: true, quantity: 25.5, stopLoss: 2.08, ... }

[Step 5] 주문 실행
  if (paperMode) → PaperTrader.execute()
  else → OrderExecutor.execute() → ccxt.createOrder()

[Step 6] 기록
  trade → SQLite trades 테이블 INSERT
  → WebSocket으로 프론트엔드에 실시간 알림

[Step 7] 실시간 최적화 체크
  RealtimeOptimizer.check()
  ├── 최근 20회 거래 승률 < 45% → 경고 + 보수적 모드
  ├── RegimeDetector.detect() → 시장 상태 변경 감지
  └── 긴급 조정 필요 시 → WeightAdjuster.adjust()
```

### 5.3 일일 리밸런싱 프로세스 상세

```
DailyRebalancer (00:00 UTC, node-cron: '0 0 * * *')

[Step 1] 매매 일시 중지
  TradingEngine.pause()
  → 열린 포지션은 유지, 새 주문만 차단

[Step 2] 과거 데이터 수집
  HistoricalDataFetcher.fetch({
    symbol: 'WLD/USDC',
    timeframes: ['1m', '5m', '15m'],
    days: 7
  })
  → candles 테이블에 INSERT OR IGNORE

[Step 3] 각 전략 백테스트
  for (strategy of enabledStrategies):
    BacktestEngine.run({
      strategyId: strategy.id,
      candles: last7days,
      parameters: strategy.currentParams
    })
  → backtest_results INSERT

[Step 4] 그리드 서치
  for (strategy of all20Strategies):
    GridSearch.search({
      strategyId: strategy.id,
      parameterGrid: strategy.config.parameterRanges,
      candles: last7days,
      optimizeFor: 'sharpe'
    })
  → 전략별 최적 파라미터 후보 선정

[Step 5] 워크포워드 검증
  for (candidate of gridSearchResults):
    WalkForward.validate({
      inSampleCandles: first5days,
      outSampleCandles: last2days,
      parameters: candidate.bestParams
    })
  → pass/fail 판정

[Step 6] 업데이트 적용
  for (strategy of all20Strategies):
    if (walkForwardPassed):
      strategy.parameters = newBestParams
    strategy.weight = calculateNewWeight(backtestResults)
    if (winRate < 0.35):
      strategy.enabled = false
    if (winRate > 0.55 && wasDisabled):
      strategy.enabled = true
  → strategy_configs UPDATE
  → rebalance_log INSERT (변경 이력)

[Step 7] 리스크 파라미터 조정
  currentATR = calcATR(last7days)
  if (currentATR > avgATR * 1.5):
    riskConfig.stopLossPercent *= 1.3
    riskConfig.maxPositionPercent *= 0.7
  → engine_state UPDATE

[Step 8] 매매 재개
  TradingEngine.resume()
  → 프론트엔드에 "리밸런싱 완료" 알림
```

---

## 6. 프론트엔드 컴포넌트 설계

### 6.1 페이지별 컴포넌트 구성

#### 메인 대시보드 (`/`)

```
┌─────────────────────────────────────────────────────┐
│ Header: [잔고: USDC 9,850 | WLD 125.3] [엔진: 실행중] │
├─────┬───────────────────────────────────────────────┤
│     │  ┌─────────────────────────────────────────┐  │
│     │  │        CandlestickChart (60%)            │  │
│  S  │  │  [1m] [5m] [15m]  지표: [RSI] [BB] [EMA]│  │
│  i  │  │  ┌─────────────────────────────────────┐│  │
│  d  │  │  │    TradingView Lightweight Charts    ││  │
│  e  │  │  │    + IndicatorOverlay                ││  │
│  b  │  │  └─────────────────────────────────────┘│  │
│  a  │  └─────────────────────────────────────────┘  │
│  r  │                                               │
│     │  ┌──────────────────┐ ┌──────────────────┐   │
│  N  │  │ ActivePositions  │ │ StrategySignals  │   │
│  a  │  │ 현재 포지션       │ │ 상위 5개 전략신호  │   │
│  v  │  │ WLD: +1.2%      │ │ RSI+BB: 매수 82% │   │
│     │  └──────────────────┘ └──────────────────┘   │
│     │                                               │
│     │  ┌─────────────────────────────────────────┐  │
│     │  │ RecentTrades (최근 거래 5건)              │  │
│     │  └─────────────────────────────────────────┘  │
├─────┴───────────────────────────────────────────────┤
│ StatusBar: [연결: Binance ✓] [오늘 수익: -$149] [레짐: 횡보] │
└─────────────────────────────────────────────────────┘
```

#### 전략 관리 (`/strategies`)

```
┌─────────────────────────────────────────────────────┐
│ [카테고리 필터: 전체|평균회귀|추세|돌파|모멘텀|...]      │
│ [난이도 필터: 전체|초급|중급|고급]                       │
├─────────────────────────────────────────────────────┤
│ ┌─ 평균회귀 ──────────────────────────────────────┐ │
│ │ ┌──────────────────────────────────────────────┐│ │
│ │ │ StrategyCard                                 ││ │
│ │ │ [ON/OFF 토글]  RSI + 볼린저밴드    [초급]     ││ │
│ │ │ 가중치: ████████░░ 1.5x                      ││ │
│ │ │ 현재 신호: [매수 82%]  승률(7d): 58%          ││ │
│ │ │ [상세보기] [파라미터 편집]                      ││ │
│ │ └──────────────────────────────────────────────┘│ │
│ │ ┌──────────────────────────────────────────────┐│ │
│ │ │ VWAP 평균회귀  ...                           ││ │
│ │ └──────────────────────────────────────────────┘│ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─ 추세추종 ──────────────────────────────────────┐ │
│ │ (같은 패턴으로 반복)                              │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 6.2 실시간 데이터 흐름 (프론트엔드)

```
거래소 WebSocket
  ↓ (Server)
WebSocketManager → 캔들 데이터 가공
  ↓ (Next.js API Route → SSE 또는 polling)
브라우저
  ↓
React State (useState/SWR)
  ├── CandlestickChart (실시간 차트 업데이트)
  ├── StrategySignals (신호 업데이트)
  ├── ActivePositions (포지션 업데이트)
  └── StatusBar (연결/수익 업데이트)

업데이트 주기:
- 차트 캔들: 1초 간격 (WebSocket ticker → 현재 캔들 업데이트)
- 전략 신호: 캔들 마감 시 (5분)
- 잔고: 주문 체결 시 + 30초 polling
- 일별 성과: 1분 polling
```

---

## 7. 환경 변수 (.env.local)

```env
# 거래소 API (Binance 예시)
EXCHANGE_ID=binance
EXCHANGE_API_KEY=your-api-key
EXCHANGE_SECRET=your-secret-key

# 거래 설정
DEFAULT_SYMBOL=WLD/USDC
DEFAULT_TIMEFRAME=5m

# 엔진 설정
PAPER_MODE=true          # 처음에는 반드시 true
REBALANCE_CRON=0 0 * * * # 00:00 UTC

# 리스크 기본값
STOP_LOSS_PERCENT=1.0
TAKE_PROFIT_PERCENT=1.5
MAX_POSITION_PERCENT=5.0
MAX_DAILY_LOSS_PERCENT=3.0
MAX_DRAWDOWN_PERCENT=15.0
```

---

## 8. 구현 순서 상세

### Phase 1: 기초 인프라 (예상 작업 목록)

```
1.1 프로젝트 초기화
    - pnpm create next-app (App Router, TypeScript, Tailwind)
    - 의존성 설치: ccxt, better-sqlite3, technicalindicators,
      lightweight-charts, recharts, node-cron, swr
    - .env.local 설정

1.2 DB 초기화
    - src/lib/db.ts: SQLite 연결 + 테이블 생성
    - 모든 테이블 CREATE IF NOT EXISTS

1.3 레이아웃
    - Sidebar (6개 페이지 네비게이션)
    - Header (잔고, 엔진 상태)
    - StatusBar (연결 상태, 오늘 수익)

1.4 거래소 연동
    - ExchangeConnector: ccxt 초기화, 잔고 조회
    - /api/exchange/balance, /api/exchange/ticker

1.5 실시간 차트
    - WebSocketManager: 거래소 WebSocket 연결
    - CandlestickChart: Lightweight Charts 캔들스틱
    - 타임프레임 전환 (1m/5m/15m)

1.6 기본 지표 표시
    - indicators/momentum.ts: RSI 계산
    - indicators/trend.ts: EMA(9/21) 계산
    - indicators/volatility.ts: 볼린저밴드 계산
    - IndicatorOverlay: 차트에 지표 오버레이
```

### Phase 2: 전략 엔진 (예상 작업 목록)

```
2.1 전략 프레임워크
    - Strategy 인터페이스 + 레지스트리
    - StrategyConfig + defaultParameters

2.2 초급 전략 7개 구현
    - #1 RSI+BB, #2 VWAP, #5 EMA, #6 SuperTrend+MFI
    - #7 SAR+ADX, #12 돈치안, #13 MACD+RSI, #14 StochRSI

2.3 중급 전략 6개 구현
    - #3 Williams+BB, #8 멀티TF EMA, #10 지지/저항
    - #11 켈트너, #15 모멘텀버스트, #17 OBV 다이버전스

2.4 고급 전략 7개 구현
    - #4 VolumeProfile, #9 이치모쿠, #16 CCI 다이버전스
    - #18 히든 다이버전스, #19 호가창, #20 스프레드

2.5 신호 합산
    - SignalAggregator: 가중 합산 로직
    - /api/strategies/signals

2.6 전략 관리 UI
    - StrategyCard, StrategyList
    - ON/OFF 토글, 가중치 슬라이더
    - 전략 상세 설명 모달 (초보자용)
```

### Phase 3~6: (Plan 문서 참조)

---

## 9. 성능 고려사항

| 항목 | 설계 | 이유 |
|------|------|------|
| 지표 계산 | 증분 업데이트 (새 캔들만 계산) | 매번 전체 재계산 방지 |
| DB 쓰기 | WAL 모드 활성화 | 읽기/쓰기 동시성 향상 |
| 캔들 캐시 | 메모리에 최근 500개 유지 | DB 조회 최소화 |
| 전략 실행 | Promise.allSettled로 병렬 | 하나의 전략 오류가 전체 차단 방지 |
| 프론트 갱신 | SWR + 조건부 revalidate | 불필요한 리렌더링 방지 |
| 백테스트 | Worker Thread 분리 | 메인 스레드 블로킹 방지 |
| 그리드 서치 | 조합 수 제한 (전략당 최대 500) | 리밸런싱 5분 내 완료 보장 |

---

## 10. 보안 고려사항

| 항목 | 방안 |
|------|------|
| API 키 저장 | .env.local (gitignore 필수), 메모리에만 로드 |
| API 키 노출 방지 | 프론트엔드에 절대 노출 안함, 서버 API Route에서만 사용 |
| 거래 권한 | 거래소 API 키 생성 시 출금 권한 OFF, 거래 권한만 ON |
| localhost 전용 | Next.js 서버를 localhost에서만 바인딩 |
| 주문 검증 | 모든 주문은 RiskManager를 통과해야만 실행 |
| 비상 중지 | 엔진 즉시 중지 + 열린 포지션 정리 기능 |
