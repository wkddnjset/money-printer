"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Card } from "@/components/common/Card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SettingsPage() {
  const { data: engineData } = useSWR<{
    running: boolean;
    paperMode: boolean;
    symbol: string;
    timeframe: string;
  }>("/api/engine/control", fetcher);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // 전략 초기화
  async function handleInitStrategies() {
    setSaving(true);
    try {
      await fetch("/api/strategies/signals", { method: "POST" });
      setMessage("전략 설정이 초기화되었습니다.");
      mutate("/api/strategies/configs");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  }

  // 수동 리밸런싱
  async function handleRebalance() {
    setSaving(true);
    setMessage("리밸런싱 실행 중... (최대 5분 소요)");
    try {
      const res = await fetch("/api/backtest/rebalance", { method: "POST" });
      const data = await res.json();
      setMessage(
        `리밸런싱 완료! ${data.strategiesUpdated}개 업데이트, ` +
        `${data.strategiesDisabled}개 비활성화, ${data.strategiesEnabled}개 재활성화 ` +
        `(${(data.durationMs / 1000).toFixed(1)}초)`
      );
      mutate("/api/strategies/configs");
    } catch {
      setMessage("리밸런싱 실패");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 10000);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">설정</h1>

      {/* 알림 메시지 */}
      {message && (
        <div className="p-3 rounded bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 text-sm">
          {message}
        </div>
      )}

      {/* 엔진 상태 */}
      <Card title="엔진 상태">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-[var(--color-text-muted)]">상태</span>
            <div className="flex items-center gap-2 mt-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: engineData?.running ? "var(--color-green)" : "var(--color-red)",
                }}
              />
              <span className="font-bold text-sm">
                {engineData?.running ? "실행 중" : "중지됨"}
              </span>
            </div>
          </div>
          <div>
            <span className="text-xs text-[var(--color-text-muted)]">모드</span>
            <p className="font-bold text-sm mt-1">
              {engineData?.paperMode ? "페이퍼 트레이딩" : "실거래"}
            </p>
          </div>
          <div>
            <span className="text-xs text-[var(--color-text-muted)]">심볼</span>
            <p className="font-mono text-sm mt-1">{engineData?.symbol ?? "WLD/USDC"}</p>
          </div>
          <div>
            <span className="text-xs text-[var(--color-text-muted)]">타임프레임</span>
            <p className="font-mono text-sm mt-1">{engineData?.timeframe ?? "5m"}</p>
          </div>
        </div>
      </Card>

      {/* 시스템 관리 */}
      <Card title="시스템 관리">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-[var(--color-bg)] rounded">
            <div>
              <p className="text-sm font-bold">전략 초기화</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                20개 전략의 기본 설정을 DB에 삽입합니다 (기존 설정 유지).
              </p>
            </div>
            <button
              onClick={handleInitStrategies}
              disabled={saving}
              className="px-4 py-1.5 rounded text-sm bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-border)] disabled:opacity-50"
            >
              초기화
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-[var(--color-bg)] rounded">
            <div>
              <p className="text-sm font-bold">수동 리밸런싱</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                모든 전략에 대해 그리드 탐색 + 워크포워드 검증을 즉시 실행합니다.
              </p>
            </div>
            <button
              onClick={handleRebalance}
              disabled={saving}
              className="px-4 py-1.5 rounded text-sm bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "실행 중..." : "리밸런싱"}
            </button>
          </div>
        </div>
      </Card>

      {/* 환경 정보 */}
      <Card title="환경 정보">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">버전</span>
            <span className="font-mono">v1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">DB</span>
            <span className="font-mono">SQLite (WAL mode)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">전략 수</span>
            <span className="font-mono">20</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">인디케이터 수</span>
            <span className="font-mono">21</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
