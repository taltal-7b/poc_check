import 'dotenv/config';
import app from './app';
import { config } from './config';
import { startSchedulers } from './services/scheduler-service';
import { connectDb } from './utils/db';
import { logger } from './utils/logger';

async function main() {
  await connectDb();
  logger.info('Database connected');
  startSchedulers();

  app.listen(config.PORT, () => {
    logger.info(`TaskNova API server running on port ${config.PORT}`);
  });
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
