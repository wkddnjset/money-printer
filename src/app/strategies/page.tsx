"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Card } from "@/components/common/Card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface RiskInfo {
  stopLossPercent: number;
  takeProfitPercent: number;
  maxConsecutiveLosses: number;
}

interface LessonStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnl: number;
  avgPnlPercent: number;
  avgHoldMinutes: number;
  bestTrade: number;
  worstTrade: number;
}

interface RecentLesson {
  pnl: number;
  pnlPercent: number;
  holdMinutes: number;
  regime: string | null;
  at: number;
}

interface AdaptiveInfo {
  minConfidence: number;
  winPatternCount: number;
  lossPatternCount: number;
  lastAnalyzedAt: number;
}

interface StrategyDetail {
  strategyId: string;
  name: string;
  category: string;
  enabled: boolean;
  weight: number;
  risk: RiskInfo | null;
  adaptive: AdaptiveInfo | null;
  lessons: LessonStats | null;
  recentLessons: RecentLesson[];
  consecutiveLosses: number;
}

interface RiskByCategory {
  [cat: string]: {
    stopLossPercent: number;
    takeProfitPercent: number;
    maxConsecutiveLosses: number;
    consecutiveLossReduction: number;
    maxDailyLossPercent: number;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  "mean-reversion": "평균 회귀",
  "trend-following": "추세 추종",
  breakout: "돌파",
  momentum: "모멘텀",
  divergence: "다이버전스",
  "order-flow": "주문 흐름",
};

export default function StrategiesPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const { data } = useSWR<{ strategies: StrategyDetail[]; riskByCategory: RiskByCategory }>(
    "/api/strategies/details",
    fetcher,
    { refreshInterval: 5000 },
  );

  const strategies = data?.strategies ?? [];
  const riskByCategory = data?.riskByCategory ?? {};
  const categories = [...new Set(strategies.map((s) => s.category))];

  const filtered = filterCategory
    ? strategies.filter((s) => s.category === filterCategory)
    : strategies;

  const grouped = filtered.reduce<Record<string, StrategyDetail[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  async function toggleEnabled(strategyId: string, enabled: boolean) {
    setSaving(true);
    try {
      await fetch("/api/strategies/configs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId, enabled: !enabled }),
      });
      mutate("/api/strategies/details");
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = strategies.filter((s) => s.enabled).length;

  function formatDuration(minutes: number): string {
    if (minutes < 1) return `${(minutes * 60).toFixed(0)}초`;
    if (minutes < 60) return `${minutes.toFixed(0)}분`;
    return `${(minutes / 60).toFixed(1)}시간`;
  }

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = diff / 60000;
    if (mins < 1) return "방금";
    if (mins < 60) return `${mins.toFixed(0)}분 전`;
    if (mins < 1440) return `${(mins / 60).toFixed(0)}시간 전`;
    return `${(mins / 1440).toFixed(0)}일 전`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">전략 관리</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {enabledCount}/{strategies.length} 전략 활성
          </p>
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-1.5 text-sm"
        >
          <option value="">전체 카테고리</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat] ?? cat}
            </option>
          ))}
        </select>
      </div>

      {Object.entries(grouped).map(([category, strats]) => {
        const catRisk = riskByCategory[category];
        return (
          <div key={category}>
            {/* 카테고리 헤더 + 리스크 설정 */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-[var(--color-text-muted)] uppercase">
                {CATEGORY_LABELS[category] ?? category} ({strats.length})
              </h2>
              {catRisk && (
                <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--color-text-muted)]">
                  <span className="text-red-400">
                    SL {catRisk.stopLossPercent}%
                  </span>
                  <span className="text-green-400">
                    TP {catRisk.takeProfitPercent}%
                  </span>
                  <span>
                    연속손실 {catRisk.maxConsecutiveLosses}회
                  </span>
                  <span>
                    일일한도 {catRisk.maxDailyLossPercent}%
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {strats.map((s) => {
                const isExpanded = expandedId === s.strategyId;
                const hasLessons = s.lessons && s.lessons.total > 0;

                return (
                  <Card key={s.strategyId}>
                    {/* 메인 행 */}
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : s.strategyId)}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* 토글 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleEnabled(s.strategyId, s.enabled);
                          }}
                          disabled={saving}
                          className="w-10 h-5 rounded-full transition-colors relative flex-shrink-0"
                          style={{
                            backgroundColor: s.enabled ? "var(--color-green)" : "var(--color-border)",
                          }}
                        >
                          <div
                            className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                            style={{ left: s.enabled ? "22px" : "2px" }}
                          />
                        </button>

                        {/* 이름 */}
                        <span className={`font-bold text-sm truncate ${!s.enabled ? "opacity-40" : ""}`}>
                          {s.name}
                        </span>

                        {/* 연속 손실 배지 */}
                        {s.consecutiveLosses > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{
                              backgroundColor: s.consecutiveLosses >= (s.risk?.maxConsecutiveLosses ?? 10)
                                ? "rgba(239,68,68,0.2)"
                                : "rgba(245,158,11,0.2)",
                              color: s.consecutiveLosses >= (s.risk?.maxConsecutiveLosses ?? 10)
                                ? "#ef4444"
                                : "#f59e0b",
                            }}
                          >
                            연속 {s.consecutiveLosses}패
                          </span>
                        )}
                      </div>

                      {/* 우측 요약 */}
                      <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                        {/* 학습 요약 */}
                        {hasLessons ? (
                          <div className="flex items-center gap-2 text-[11px] font-mono">
                            <span className="text-[var(--color-text-muted)]">
                              {s.lessons!.total}건
                            </span>
                            <span style={{ color: s.lessons!.winRate >= 50 ? "var(--color-green)" : "var(--color-red)" }}>
                              {s.lessons!.winRate.toFixed(0)}%승
                            </span>
                            <span style={{ color: s.lessons!.avgPnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
                              {s.lessons!.avgPnl >= 0 ? "+" : ""}${s.lessons!.avgPnl.toFixed(3)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--color-text-muted)]">학습 데이터 없음</span>
                        )}

                        {/* 펼침 화살표 */}
                        <span className="text-[var(--color-text-muted)] text-xs">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {/* 펼침 상세 */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-3">
                        {/* 리스크 설정 */}
                        <div>
                          <div className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase">리스크 설정</div>
                          <div className="flex gap-2">
                            <div className="flex-1 p-2 rounded bg-[var(--color-bg)]">
                              <div className="text-[10px] text-[var(--color-text-muted)]">손절</div>
                              <div className="text-sm font-mono font-bold text-red-400">
                                {s.risk?.stopLossPercent ?? "-"}%
                              </div>
                            </div>
                            <div className="flex-1 p-2 rounded bg-[var(--color-bg)]">
                              <div className="text-[10px] text-[var(--color-text-muted)]">익절</div>
                              <div className="text-sm font-mono font-bold text-green-400">
                                {s.risk?.takeProfitPercent ?? "-"}%
                              </div>
                            </div>
                            <div className="flex-1 p-2 rounded bg-[var(--color-bg)]">
                              <div className="text-[10px] text-[var(--color-text-muted)]">손익비</div>
                              <div className="text-sm font-mono font-bold">
                                {s.risk ? `1:${(s.risk.takeProfitPercent / s.risk.stopLossPercent).toFixed(1)}` : "-"}
                              </div>
                            </div>
                            <div className="flex-1 p-2 rounded bg-[var(--color-bg)]">
                              <div className="text-[10px] text-[var(--color-text-muted)]">연속손실 한도</div>
                              <div className="text-sm font-mono font-bold">
                                {s.risk?.maxConsecutiveLosses ?? "-"}회
                              </div>
                            </div>
                            <div className="flex-1 p-2 rounded bg-[var(--color-bg)]">
                              <div className="text-[10px] text-[var(--color-text-muted)]">신뢰도 기준</div>
                              <div className="text-sm font-mono font-bold">
                                {s.adaptive ? `${(s.adaptive.minConfidence * 100).toFixed(0)}%` : "30%"}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 학습 통계 */}
                        {hasLessons && (
                          <div>
                            <div className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase">학습 통계</div>
                            <div className="flex gap-2">
                              <div className="flex-1 p-2 rounded bg-[var(--color-bg)]">
                                <div className="text-[10px] text-[var(--color-text-muted)]">총 거래</div>
                                <div className="text-sm font-mono font-bold">{s.lessons!.total}건</div>
                                <div className="text-[10px] text-[var(--color-text-muted)]">
                                  {s.lessons!.wins}승 {s.lessons!.losses}패
                                </div>
                              </div>
                              <div className="flex-1 p-2 rounded bg-[var(--color-bg)]">
                                <div className="text-[10px] text-[var(--color-text-muted)]">승률</div>
                                <div
                                  className="text-sm font-mono font-bold"
                                  style={{ color: s.lessons!.winRate >= 50 ? "var(--color-green)" : "var(--color-red)" }}
                                >
                                  {s.lessons!.winRate.toFixed(1)}%
                                </div>
                              </div>
                              <div className="flex-1 p-2 rounded bg-[var(--color-bg)]">
                                <div className="text-[10px] text-[var(--color-text-muted)]">평균 수익</div>
                                <div
                                  className="text-sm font-mono font-bold"
                                  style={{ color: s.lessons!.avgPnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
                                >
                                  {s.lessons!.avgPnl >= 0 ? "+" : ""}${s.lessons!.avgPnl.toFixed(4)}
                                </div>
                                <div className="text-[10px] text-[var(--color-text-muted)]">
                                  {s.lessons!.avgPnlPercent >= 0 ? "+" : ""}{s.lessons!.avgPnlPercent.toFixed(2)}%
                                </div>
                              </div>
                              <div className="flex-1 p-2 rounded bg-[var(--color-bg)]">
                                <div className="text-[10px] text-[var(--color-text-muted)]">평균 보유</div>
                                <div className="text-sm font-mono font-bold">
                                  {formatDuration(s.lessons!.avgHoldMinutes)}
                                </div>
                              </div>
                              <div className="flex-1 p-2 rounded bg-[var(--color-bg)]">
                                <div className="text-[10px] text-[var(--color-text-muted)]">최대/최소</div>
                                <div className="text-[11px] font-mono">
                                  <span className="text-green-400">+${s.lessons!.bestTrade.toFixed(4)}</span>
                                  <br />
                                  <span className="text-red-400">${s.lessons!.worstTrade.toFixed(4)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 학습 패턴 */}
                        {s.adaptive && (
                          <div>
                            <div className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase">학습 패턴</div>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-green-400">
                                승리 패턴 {s.adaptive.winPatternCount}개
                              </span>
                              <span className="text-red-400">
                                손실 패턴 {s.adaptive.lossPatternCount}개
                              </span>
                              {s.adaptive.lastAnalyzedAt > 0 && (
                                <span className="text-[var(--color-text-muted)]">
                                  마지막 분석: {timeAgo(s.adaptive.lastAnalyzedAt)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 최근 거래 기록 */}
                        {s.recentLessons.length > 0 && (
                          <div>
                            <div className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase">최근 거래</div>
                            <div className="space-y-1">
                              {s.recentLessons.map((l, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-3 text-[11px] font-mono px-2 py-1 rounded bg-[var(--color-bg)]"
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: l.pnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
                                  />
                                  <span
                                    className="w-20"
                                    style={{ color: l.pnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
                                  >
                                    {l.pnl >= 0 ? "+" : ""}${l.pnl.toFixed(4)}
                                  </span>
                                  <span className="text-[var(--color-text-muted)] w-14">
                                    {l.pnlPercent >= 0 ? "+" : ""}{l.pnlPercent.toFixed(2)}%
                                  </span>
                                  <span className="text-[var(--color-text-muted)] w-14">
                                    {formatDuration(l.holdMinutes)}
                                  </span>
                                  {l.regime && (
                                    <span className="text-[var(--color-text-muted)]">{l.regime}</span>
                                  )}
                                  <span className="text-[var(--color-text-muted)] ml-auto">
                                    {timeAgo(l.at)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
