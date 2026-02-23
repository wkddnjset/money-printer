import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "money-printer.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // data/ 디렉토리 생성
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // WAL 모드 활성화 (성능 향상)
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  // 테이블 초기화
  initTables(db);

  return db;
}

function initTables(db: Database.Database): void {
  db.exec(`
    -- 캔들(시세) 데이터 캐시
    CREATE TABLE IF NOT EXISTS candles (
      symbol      TEXT    NOT NULL,
      timeframe   TEXT    NOT NULL,
      timestamp   INTEGER NOT NULL,
      open        REAL    NOT NULL,
      high        REAL    NOT NULL,
      low         REAL    NOT NULL,
      close       REAL    NOT NULL,
      volume      REAL    NOT NULL,
      PRIMARY KEY (symbol, timeframe, timestamp)
    );
    CREATE INDEX IF NOT EXISTS idx_candles_lookup
      ON candles(symbol, timeframe, timestamp DESC);

    -- 거래 내역
    CREATE TABLE IF NOT EXISTS trades (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id   TEXT    NOT NULL,
      symbol        TEXT    NOT NULL,
      side          TEXT    NOT NULL,
      entry_price   REAL    NOT NULL,
      exit_price    REAL,
      quantity      REAL    NOT NULL,
      pnl           REAL,
      pnl_percent   REAL,
      fee           REAL    NOT NULL DEFAULT 0,
      is_paper      INTEGER NOT NULL DEFAULT 0,
      signal_data   TEXT,
      entry_at      INTEGER NOT NULL,
      exit_at       INTEGER,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_trades_strategy
      ON trades(strategy_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trades_date
      ON trades(created_at DESC);

    -- 전략 설정
    CREATE TABLE IF NOT EXISTS strategy_configs (
      strategy_id   TEXT    PRIMARY KEY,
      name          TEXT    NOT NULL,
      category      TEXT    NOT NULL,
      difficulty    TEXT    NOT NULL,
      enabled       INTEGER NOT NULL DEFAULT 0,
      weight        REAL    NOT NULL DEFAULT 1.0,
      parameters    TEXT    NOT NULL,
      description   TEXT,
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- 백테스트 결과
    CREATE TABLE IF NOT EXISTS backtest_results (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id   TEXT    NOT NULL,
      timeframe     TEXT    NOT NULL,
      period_start  INTEGER NOT NULL,
      period_end    INTEGER NOT NULL,
      win_rate      REAL    NOT NULL,
      total_return  REAL    NOT NULL,
      max_drawdown  REAL    NOT NULL,
      sharpe_ratio  REAL,
      trade_count   INTEGER NOT NULL,
      avg_trade_pnl REAL,
      parameters    TEXT    NOT NULL,
      walk_forward_pass INTEGER,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_backtest_strategy
      ON backtest_results(strategy_id, created_at DESC);

    -- 리밸런싱 변경 이력
    CREATE TABLE IF NOT EXISTS rebalance_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      executed_at   INTEGER NOT NULL,
      strategy_id   TEXT    NOT NULL,
      change_type   TEXT    NOT NULL,
      old_value     TEXT    NOT NULL,
      new_value     TEXT    NOT NULL,
      reason        TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rebalance_date
      ON rebalance_log(executed_at DESC);

    -- 일별 성과
    CREATE TABLE IF NOT EXISTS daily_performance (
      date             TEXT    PRIMARY KEY,
      starting_balance REAL    NOT NULL,
      ending_balance   REAL    NOT NULL,
      total_pnl        REAL    NOT NULL,
      trade_count      INTEGER NOT NULL,
      win_count        INTEGER NOT NULL,
      best_strategy    TEXT,
      worst_strategy   TEXT,
      regime           TEXT
    );

    -- 세션 테이블
    CREATE TABLE IF NOT EXISTS sessions (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at               INTEGER NOT NULL,
      ended_at                 INTEGER,
      initial_balance          REAL    NOT NULL,
      strategy_count           INTEGER NOT NULL,
      allocation_per_strategy  REAL    NOT NULL,
      status                   TEXT    NOT NULL DEFAULT 'active'
    );

    -- 전략별 자본 배분
    CREATE TABLE IF NOT EXISTS strategy_allocations (
      session_id    INTEGER NOT NULL REFERENCES sessions(id),
      strategy_id   TEXT    NOT NULL,
      initial_usdc  REAL    NOT NULL,
      current_usdc  REAL    NOT NULL,
      asset_qty     REAL    NOT NULL DEFAULT 0,
      trade_count   INTEGER NOT NULL DEFAULT 0,
      total_pnl     REAL    NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, strategy_id)
    );

    -- 엔진 상태 (Key-Value)
    CREATE TABLE IF NOT EXISTS engine_state (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- 전략별 학습 데이터 (매 청산 시 기록)
    CREATE TABLE IF NOT EXISTS strategy_lessons (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id      TEXT    NOT NULL,
      session_id       INTEGER,
      entry_indicators TEXT    NOT NULL,
      exit_indicators  TEXT,
      entry_price      REAL    NOT NULL,
      exit_price       REAL    NOT NULL,
      pnl              REAL    NOT NULL,
      pnl_percent      REAL    NOT NULL,
      hold_duration    INTEGER NOT NULL,
      market_regime    TEXT,
      created_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lessons_strategy
      ON strategy_lessons(strategy_id, created_at DESC);

    -- 전략별 적응형 설정 (학습 결과)
    CREATE TABLE IF NOT EXISTS strategy_adaptive (
      strategy_id        TEXT PRIMARY KEY,
      min_confidence     REAL    NOT NULL DEFAULT 0.5,
      win_pattern_count  INTEGER NOT NULL DEFAULT 0,
      loss_pattern_count INTEGER NOT NULL DEFAULT 0,
      last_analyzed_at   INTEGER NOT NULL DEFAULT 0,
      analysis_data      TEXT
    );
  `);

  // trades 테이블에 session_id 컬럼 추가 (마이그레이션)
  try {
    db.exec("ALTER TABLE trades ADD COLUMN session_id INTEGER REFERENCES sessions(id)");
  } catch {
    // 이미 존재하면 무시
  }

  // 인덱스 추가
  db.exec("CREATE INDEX IF NOT EXISTS idx_trades_session ON trades(session_id, strategy_id)");

  // 엔진 초기 상태 설정
  const insertState = db.prepare(`
    INSERT OR IGNORE INTO engine_state (key, value) VALUES (?, ?)
  `);

  insertState.run("engine_running", JSON.stringify({ running: false }));
  insertState.run("paper_mode", JSON.stringify({ enabled: process.env.PAPER_MODE !== "false" }));
  insertState.run(
    "current_regime",
    JSON.stringify({ regime: "ranging", confidence: 0 })
  );
  insertState.run(
    "risk_state",
    JSON.stringify({ dailyLoss: 0, consecutiveLosses: 0 })
  );
}
