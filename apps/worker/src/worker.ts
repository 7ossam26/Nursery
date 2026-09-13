import pino from 'pino';
const logger = pino({ redact: ['databaseUrl', 'token'] });
logger.info('worker started; no Phase 01 jobs are registered');
const stop = () => { logger.info('worker stopped'); process.exit(0); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
