import pino from 'pino';

/** Structured logs: scan id, stage, duration, status — never page bodies or cookies. */
export const log = pino({ level: process.env.LOG_LEVEL ?? 'info', base: { service: 'worker' } });
