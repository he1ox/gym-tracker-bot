import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest 4 flattened `poolOptions.forks.execArgv` into a top-level option.
    execArgv: ['--disable-warning=ExperimentalWarning'],
    projects: [
      {
        test: {
          name: 'node',
          include: ['packages/*/src/**/*.test.ts', 'apps/server/src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
          setupFiles: ['apps/web/src/vitest.setup.ts'],
        },
      },
    ],
  },
});
