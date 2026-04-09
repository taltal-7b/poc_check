const levels = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof levels;

const currentLevel: Level = (process.env.LOG_LEVEL as Level) || 'info';

function shouldLog(level: Level): boolean {
  return levels[level] <= levels[currentLevel];
}

function formatMessage(level: Level, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  error: (message: string, meta?: unknown) => {
    if (shouldLog('error')) console.error(formatMessage('error', message, meta));
  },
  warn: (message: string, meta?: unknown) => {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, meta));
  },
  info: (message: string, meta?: unknown) => {
    if (shouldLog('info')) console.info(formatMessage('info', message, meta));
  },
  debug: (message: string, meta?: unknown) => {
    if (shouldLog('debug')) console.debug(formatMessage('debug', message, meta));
  },
};
