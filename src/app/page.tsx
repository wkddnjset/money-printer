"use client";

import { useState } from "react";
import useSWR from "swr";
import { CandlestickChart, indicatorToOverlay } from "@/components/chart/CandlestickChart";
import { IndicatorPanel } from "@/components/chart/IndicatorPanel";
import { Card } from "@/components/common/Card";
import { SignalSummary } from "@/components/strategy/SignalSummary";
import { EngineControl } from "@/components/trade/EngineControl";
import { ActivePositions } from "@/components/trade/ActivePositions";
import type { OHLCV, Symbol, Timeframe } from "@/types/candle";
import type { IndicatorResult } from "@/types/indicator";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m"];
const SYMBOLS: Symbol[] = ["WLD/USDC", "ETH/USDC", "SOL/USDC"];

interface AllocationData {
  strategyId: string;
  strategyName: string;
  category: string;
  currentUsdc: number;
  assetQty: number;
  totalPnl: number;
  tradeCount: number;
  minConfidence: number;
  isConservative: boolean;
  lessonCount: number;
}

export default function DashboardPage() {
  const [symbol, setSymbol] = useState<Symbol>("WLD/USDC");
  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [showBB, setShowBB] = useState(true);
  const [showEMA, setShowEMA] = useState(true);

  // 캔들 데이터 (5초마다 갱신 - 엔진 틱과 동기화)
  const { data: candleData } = useSWR(
    `/api/exchange/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  // 지표 데이터 (5초마다 갱신)
  const { data: indicatorData } = useSWR(
    `/api/indicators?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&ids=rsi,macd,bb,ema`,
    fetcher,
    { refreshInterval: 5000 }
  );

  // 엔진 상태
  const { data: engineStatus } = useSWR<{
    running: boolean;
    paperMode: boolean;
    sessionId: number | null;
    todayPnl: { amount: number; percent: number };
    allTimePnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    totalPnlPercent: number;
    initialBalance: number;
    balance: { USDC: number };
    wallet: { usdc: number; wld: number; wldPrice: number; wldValue: number; total: number };
    allocations: { strategyId: string; currentUsdc: number; assetQty: number; totalPnl: number; tradeCount: number }[];
  }>("/api/engine/status", fetcher, { refreshInterval: 5000 });

  // 전략별 배분 데이터
  const { data: allocData } = useSWR<{ sessionId: number | null; allocations: AllocationData[] }>(
    "/api/strategies/allocations",
    fetcher,
    { refreshInterval: 5000 }
  );

  const candles: OHLCV[] = candleData?.candles ?? [];
  const rsiResults: IndicatorResult[] = indicatorData?.indicators?.rsi ?? [];
  const macdResults: IndicatorResult[] = indicatorData?.indicators?.macd ?? [];
  const bbResults: IndicatorResult[] = indicatorData?.indicators?.bb ?? [];
  const emaResults: IndicatorResult[] = indicatorData?.indicators?.ema ?? [];

  // 차트 오버레이
  const overlays = [];
  if (showBB && bbResults.length > 0) {
    overlays.push(
      indicatorToOverlay(bbResults, "upper", "BB Upper", "#636efa"),
      indicatorToOverlay(bbResults, "middle", "BB Mid", "#636efa80"),
      indicatorToOverlay(bbResults, "lower", "BB Lower", "#636efa")
    );
  }
  if (showEMA && emaResults.length > 0) {
    overlays.push(
      indicatorToOverlay(emaResults, "value", "EMA 9", "#ff6b6b")
    );
  }

  // 현재가
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = lastCandle && prevCandle
    ? ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100
    : 0;

  // 지갑 잔고
  const walletUsdc = engineStatus?.wallet?.usdc ?? 0;
  const walletWld = engineStatus?.wallet?.wld ?? 0;
  const walletWldPrice = engineStatus?.wallet?.wldPrice ?? 0;
  const walletWldValue = engineStatus?.wallet?.wldValue ?? 0;
  const totalBalance = engineStatus?.balance?.USDC ?? 0;
  const initialBalance = engineStatus?.initialBalance ?? 0;
  const totalPnl = engineStatus?.totalPnl ?? 0;
  const totalPnlPercent = engineStatus?.totalPnlPercent ?? 0;
  const unrealizedPnl = engineStatus?.unrealizedPnl ?? 0;
  const todayPnlAmount = engineStatus?.todayPnl?.amount ?? 0;
  const todayPnlPercent = engineStatus?.todayPnl?.percent ?? 0;

  // 전략 배분
  const allocations = allocData?.allocations ?? [];

  return (
    <div className="space-y-4">
      {/* USD 잔고 & 수익률 요약 */}
      <div className="grid grid-cols-5 gap-3">
        <Card>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">총 자산</div>
          <div className="text-xl font-mono font-bold">${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="space-y-0.5 mt-1">
            <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
              <span>USDC</span>
              <span className="font-mono">${walletUsdc.toFixed(2)}</span>
            </div>
            {walletWld > 0.001 && (
              <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
                <span>WLD ({walletWld.toFixed(2)})</span>
                <span className="font-mono">${walletWldValue.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center gap-1 pt-0.5">
              {engineStatus?.paperMode && (
                <span className="text-[10px] bg-[var(--color-accent)] text-white px-1 py-0.5 rounded">PAPER</span>
              )}
              {engineStatus?.sessionId && (
                <span className="text-[10px] text-[var(--color-text-muted)]">S#{engineStatus.sessionId}</span>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">총 수익</div>
          <div
            className="text-xl font-mono font-bold"
            style={{ color: totalPnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
          >
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </div>
          <div
            className="text-xs font-mono"
            style={{ color: totalPnlPercent >= 0 ? "var(--color-green)" : "var(--color-red)" }}
          >
            {totalPnlPercent >= 0 ? "+" : ""}{totalPnlPercent.toFixed(2)}%
          </div>
          {initialBalance > 0 && (
            <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
              시작: ${initialBalance.toFixed(2)}
            </div>
          )}
        </Card>
        <Card>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">미실현 손익</div>
          <div
            className="text-xl font-mono font-bold"
            style={{ color: unrealizedPnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
          >
            {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(2)}
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">열린 포지션</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">오늘 수익</div>
          <div
            className="text-xl font-mono font-bold"
            style={{ color: todayPnlAmount >= 0 ? "var(--color-green)" : "var(--color-red)" }}
          >
            {todayPnlAmount >= 0 ? "+" : ""}${todayPnlAmount.toFixed(2)}
          </div>
          <div
            className="text-xs font-mono"
            style={{ color: todayPnlPercent >= 0 ? "var(--color-green)" : "var(--color-red)" }}
          >
            {todayPnlPercent >= 0 ? "+" : ""}{todayPnlPercent.toFixed(2)}%
          </div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">활성 전략</div>
          <div className="text-xl font-mono font-bold">{allocations.length}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {allocations.length > 0
              ? `각 $${(allocations[0]?.currentUsdc ?? 0).toFixed(0)} 배분`
              : "세션 없음"}
          </div>
        </Card>
      </div>

      {/* 심볼 & 타임프레임 선택 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as Symbol)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-1.5 text-sm"
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div className="flex rounded border border-[var(--color-border)] overflow-hidden">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 text-sm transition-colors ${
                  timeframe === tf
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {lastCandle && (
            <div className="flex items-center gap-2">
              <span className="text-xl font-mono font-bold">
                ${lastCandle.close.toFixed(4)}
              </span>
              <span
                className="text-sm font-mono"
                style={{
                  color: priceChange >= 0 ? "var(--color-green)" : "var(--color-red)",
                }}
              >
                {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* 오버레이 토글 */}
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showBB}
              onChange={(e) => setShowBB(e.target.checked)}
              className="accent-[#636efa]"
            />
            <span style={{ color: "#636efa" }}>BB</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showEMA}
              onChange={(e) => setShowEMA(e.target.checked)}
              className="accent-[#ff6b6b]"
            />
            <span style={{ color: "#ff6b6b" }}>EMA 9</span>
          </label>
        </div>
      </div>

      {/* 캔들스틱 차트 */}
      {candles.length > 0 ? (
        <CandlestickChart candles={candles} overlays={overlays} height={420} />
      ) : (
        <Card>
          <div className="h-[420px] flex items-center justify-center text-[var(--color-text-muted)]">
            거래소에서 데이터를 불러오는 중...
            <br />
            <span className="text-xs mt-1">
              .env.local에 API 키를 설정했는지 확인하세요.
            </span>
          </div>
        </Card>
      )}

      {/* 지표 패널 (RSI + MACD) */}
      <IndicatorPanel rsi={rsiResults} macd={macdResults} />

      {/* 전략별 상태 그리드 */}
      {allocations.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-muted)] mb-2">전략별 배분 현황</h2>
          <div className="grid grid-cols-6 gap-2">
            {allocations.map((a) => (
              <div
                key={a.strategyId}
                className="p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)]"
              >
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xs text-[var(--color-text-muted)] truncate">
                    {a.strategyName}
                  </span>
                  {a.isConservative && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1 rounded flex-shrink-0">
                      보수
                    </span>
                  )}
                </div>
                <div className="text-sm font-mono font-bold">
                  ${a.currentUsdc.toFixed(0)}
                </div>
                <div
                  className="text-xs font-mono"
                  style={{ color: a.totalPnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
                >
                  {a.totalPnl >= 0 ? "+" : ""}{a.totalPnl.toFixed(2)}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                  {a.tradeCount > 0 && <span>{a.tradeCount}건</span>}
                  {a.lessonCount > 0 && (
                    <span className="ml-auto" title={`학습 데이터 ${a.lessonCount}건, 임계값 ${(a.minConfidence * 100).toFixed(0)}%`}>
                      학습 {a.lessonCount}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 하단 정보 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <EngineControl />
        <Card title="전략 신호">
          <SignalSummary symbol={symbol} timeframe={timeframe} />
        </Card>
        <ActivePositions />
      </div>
    </div>
  );
}
