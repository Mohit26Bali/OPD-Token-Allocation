import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    hookTimeout: 20000,
    // Integration tests share one physical Postgres test database with no
    // per-file isolation (no schema-per-worker), so test files must not run
    // concurrently against it — otherwise one file's resetDb() races another
    // file's assertions. Domain unit tests don't touch a DB at all, so this
    // costs a little wall-clock time but nothing else.
    fileParallelism: false,
  },
});
