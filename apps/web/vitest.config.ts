import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: '@magnus/db/client', replacement: path.resolve(__dirname, '../../packages/db/src/client.ts') },
      { find: '@magnus/db', replacement: path.resolve(__dirname, '../../packages/db/src/client.ts') },
      { find: '@magnus/security', replacement: path.resolve(__dirname, '../../packages/security/src/index.ts') },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 15000,
  },
});