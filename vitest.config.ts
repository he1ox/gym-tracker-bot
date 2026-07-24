import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    // Vitest 4 flattened `poolOptions.forks.execArgv` into a top-level option.
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
});
