import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // These hit a real Postgres (see tests/setup.ts) via one shared
    // connection pool — run test files serially to avoid pool exhaustion
    // and cross-file data interference (each test still gets its own org).
    fileParallelism: false,
  },
});
