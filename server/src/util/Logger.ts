// Tiny structured logger — single-line JSON for ingestion by Loki / Datadog / etc.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const MIN_LEVEL: number = LEVELS[(process.env.LOG_LEVEL as Level) || "info"];

function emit(level: Level, msg: string, fields?: Record<string, any>) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const out = JSON.stringify({
    ts: Date.now(),
    level,
    msg,
    ...(fields || {}),
  });
  if (level === "error") console.error(out);
  else console.log(out);
}

export const log = {
  debug: (m: string, f?: Record<string, any>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, any>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, any>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, any>) => emit("error", m, f),
};
