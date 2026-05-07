import { logger } from '../utils/logger';
import { runIssueDueSummaryJob, shouldRunIssueDueSummary } from './issue-due-summary-service';

const CHECK_INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running || !shouldRunIssueDueSummary()) return;
  running = true;
  try {
    await runIssueDueSummaryJob();
  } catch (error) {
    logger.warn('Scheduled AI due summary notification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
}

export function startSchedulers(): void {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((error) => {
      logger.warn('Scheduler tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, CHECK_INTERVAL_MS);
  timer.unref();
  tick().catch((error) => {
    logger.warn('Initial scheduler tick failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
