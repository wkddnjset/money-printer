import { getDb } from "@/lib/db";

interface IndicatorStats {
  mean: number;
  std: number;
  count: number;
}

interface PatternAnalysis {
  winPatterns: Record<string, IndicatorStats>;
  lossPatterns: Record<string, IndicatorStats>;
  winCount: number;
  lossCount: number;
  winRate: number;
}

interface LessonCheckResult {
  factor: number; // confidence 곱하기 계수 (0.6~1.1)
  reason: string;
}

interface LessonRow {
  id: number;
  strategy_id: string;
  entry_indicators: string;
  exit_indicators: string | null;
  pnl: number;
  pnl_percent: number;
  hold_duration: number;
  market_regime: string | null;
  created_at: number;
}

interface AdaptiveRow {
  strategy_id: string;
  min_confidence: number;
  win_pattern_count: number;
  loss_pattern_count: number;
  last_analyzed_at: number;
  analysis_data: string | null;
}

const MIN_LESSONS_FOR_LEARNING = 10;
const MIN_CONFIDENCE_BOUND = 0.3;
const MAX_CONFIDENCE_BOUND = 0.8;

/**
 * 전략의 과거 승/패 지표 패턴 분석
 */
export function analyzePatterns(strategyId: string): PatternAnalysis | null {
  const db = getDb();

  const lessons = db.prepare(`
    SELECT * FROM strategy_lessons
    WHERE strategy_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(strategyId) as LessonRow[];

  if (lessons.length < MIN_LESSONS_FOR_LEARNING) return null;

  const wins = lessons.filter((l) => l.pnl > 0);
  const losses = lessons.filter((l) => l.pnl <= 0);

  const winPatterns = computeIndicatorStats(wins);
  const lossPatterns = computeIndicatorStats(losses);

  return {
    winPatterns,
    lossPatterns,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: lessons.length > 0 ? wins.length / lessons.length : 0,
  };
}

/**
 * 현재 조건이 과거 손실 패턴과 유사한지 체크
 */
export function checkLessonMatch(
  strategyId: string,
  currentIndicators: Record<string, number>,
): LessonCheckResult {
  const analysis = analyzePatterns(strategyId);

  if (!analysis) {
    return { factor: 1.0, reason: "학습 데이터 부족" };
  }

  const indicatorKeys = Object.keys(currentIndicators);
  if (indicatorKeys.length === 0) {
    return { factor: 1.0, reason: "지표 없음" };
  }

  let lossMatchCount = 0;
  let winMatchCount = 0;
  let totalChecked = 0;

  for (const key of indicatorKeys) {
    const value = currentIndicators[key];
    if (typeof value !== "number" || isNaN(value)) continue;

    const lossStats = analysis.lossPatterns[key];
    const winStats = analysis.winPatterns[key];

    if (!lossStats && !winStats) continue;
    totalChecked++;

    // 손실 패턴 ±1σ 안에 들면 매치
    if (lossStats && lossStats.std > 0) {
      if (Math.abs(value - lossStats.mean) <= lossStats.std) {
        lossMatchCount++;
      }
    }

    // 승리 패턴 ±1σ 안에 들면 매치
    if (winStats && winStats.std > 0) {
      if (Math.abs(value - winStats.mean) <= winStats.std) {
        winMatchCount++;
      }
    }
  }

  if (totalChecked === 0) {
    return { factor: 1.0, reason: "비교 가능 지표 없음" };
  }

  const lossMatchRatio = lossMatchCount / totalChecked;
  const winMatchRatio = winMatchCount / totalChecked;

  // 손실 패턴 유사도가 높고 승리 패턴과 안 맞으면 → confidence 차감
  if (lossMatchRatio > 0.5 && winMatchRatio < 0.3) {
    const penalty = 0.6 + (0.2 * (1 - lossMatchRatio)); // 0.6~0.8
    return {
      factor: penalty,
      reason: `손실 패턴 유사 (${(lossMatchRatio * 100).toFixed(0)}% 매치)`,
    };
  }

  // 승리 패턴 유사도가 높으면 → 소폭 상승
  if (winMatchRatio > 0.5 && lossMatchRatio < 0.3) {
    return {
      factor: Math.min(1.1, 1.0 + (winMatchRatio - 0.5) * 0.2),
      reason: `승리 패턴 유사 (${(winMatchRatio * 100).toFixed(0)}% 매치)`,
    };
  }

  return { factor: 1.0, reason: "패턴 중립" };
}

/**
 * 보수적 임계값 자동 조정
 */
export function updateAdaptiveThreshold(strategyId: string): void {
  const db = getDb();

  // 최근 20건 승률 분석
  const recentLessons = db.prepare(`
    SELECT pnl FROM strategy_lessons
    WHERE strategy_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(strategyId) as { pnl: number }[];

  if (recentLessons.length < MIN_LESSONS_FOR_LEARNING) return;

  const wins = recentLessons.filter((l) => l.pnl > 0).length;
  const winRate = wins / recentLessons.length;

  let minConfidence = 0.5;
  if (winRate < 0.3) {
    minConfidence = 0.7; // 매우 보수적
  } else if (winRate < 0.4) {
    minConfidence = 0.6; // 보수적
  } else if (winRate > 0.55) {
    minConfidence = 0.5; // 원래대로
  }

  // 바운드 적용
  minConfidence = Math.max(MIN_CONFIDENCE_BOUND, Math.min(MAX_CONFIDENCE_BOUND, minConfidence));

  // 패턴 분석
  const analysis = analyzePatterns(strategyId);

  db.prepare(`
    INSERT INTO strategy_adaptive (strategy_id, min_confidence, win_pattern_count, loss_pattern_count, last_analyzed_at, analysis_data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(strategy_id) DO UPDATE SET
      min_confidence = excluded.min_confidence,
      win_pattern_count = excluded.win_pattern_count,
      loss_pattern_count = excluded.loss_pattern_count,
      last_analyzed_at = excluded.last_analyzed_at,
      analysis_data = excluded.analysis_data
  `).run(
    strategyId,
    minConfidence,
    analysis?.winCount ?? 0,
    analysis?.lossCount ?? 0,
    Date.now(),
    analysis ? JSON.stringify({ winRate, patterns: summarizePatterns(analysis) }) : null,
  );
}

/**
 * 전략의 현재 적응형 임계값 로드
 */
export function getAdaptiveThreshold(strategyId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT min_confidence FROM strategy_adaptive WHERE strategy_id = ?"
  ).get(strategyId) as { min_confidence: number } | undefined;

  return row?.min_confidence ?? 0.3;
}

/**
 * 전략의 학습 정보 전체 로드
 */
export function getAdaptiveInfo(strategyId: string): AdaptiveRow | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM strategy_adaptive WHERE strategy_id = ?"
  ).get(strategyId) as AdaptiveRow | undefined;

  return row ?? null;
}

/**
 * 모든 전략의 학습 업데이트 실행
 */
export function updateAllStrategies(strategyIds: string[]): void {
  for (const id of strategyIds) {
    updateAdaptiveThreshold(id);
  }
}

// --- 내부 유틸 ---

function computeIndicatorStats(lessons: LessonRow[]): Record<string, IndicatorStats> {
  const result: Record<string, IndicatorStats> = {};
  const values: Record<string, number[]> = {};

  for (const lesson of lessons) {
    let indicators: Record<string, number>;
    try {
      indicators = JSON.parse(lesson.entry_indicators);
    } catch {
      continue;
    }

    for (const [key, val] of Object.entries(indicators)) {
      if (typeof val !== "number" || isNaN(val)) continue;
      if (!values[key]) values[key] = [];
      values[key].push(val);
    }
  }

  for (const [key, vals] of Object.entries(values)) {
    if (vals.length < 3) continue; // 최소 3개 이상 필요
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const std = Math.sqrt(variance);
    result[key] = { mean, std, count: vals.length };
  }

  return result;
}

function summarizePatterns(analysis: PatternAnalysis): Record<string, { win: string; loss: string }> {
  const summary: Record<string, { win: string; loss: string }> = {};
  const allKeys = new Set([
    ...Object.keys(analysis.winPatterns),
    ...Object.keys(analysis.lossPatterns),
  ]);

  for (const key of allKeys) {
    const win = analysis.winPatterns[key];
    const loss = analysis.lossPatterns[key];
    summary[key] = {
      win: win ? `${win.mean.toFixed(2)}±${win.std.toFixed(2)}` : "N/A",
      loss: loss ? `${loss.mean.toFixed(2)}±${loss.std.toFixed(2)}` : "N/A",
    };
  }

  return summary;
}
