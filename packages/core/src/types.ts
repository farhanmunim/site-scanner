// Shared types for the scanner, kept dependency-free so the worker (gather side), the web app and the CLI can all use
// them. Split by what they describe; this file re-exports everything so imports stay `@site-scanner/core/types`.
export * from './types/common.js';
export * from './types/gathered.js';
export * from './types/scores.js';
export * from './types/report.js';
export * from './types/external.js';
