import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@magnus/auth/jwtAuth', replacement: path.resolve(__dirname, 'packages/auth/src/jwtAuth.ts') },
      { find: '@magnus/auth', replacement: path.resolve(__dirname, 'packages/auth/src/index.ts') },
      { find: '@magnus/config/envValidator', replacement: path.resolve(__dirname, 'packages/config/src/envValidator.ts') },
      { find: '@magnus/config', replacement: path.resolve(__dirname, 'packages/config/src/index.ts') },
      { find: '@magnus/db/client', replacement: path.resolve(__dirname, 'packages/db/src/client.ts') },
      { find: '@magnus/db/types', replacement: path.resolve(__dirname, 'packages/db/src/types.ts') },
      { find: '@magnus/db', replacement: path.resolve(__dirname, 'packages/db/src/client.ts') },
      { find: '@magnus/security', replacement: path.resolve(__dirname, 'packages/security/src/index.ts') },
      { find: '@magnus/subscription', replacement: path.resolve(__dirname, 'packages/subscription/src/index.ts') },
      { find: 'next/server', replacement: path.resolve(__dirname, 'apps/web/node_modules/next/server.js') },
      { find: 'next/headers', replacement: path.resolve(__dirname, 'apps/web/node_modules/next/headers.js') },
      { find: /^@\//, replacement: `${path.resolve(__dirname, 'apps/web/src')}/` },
    ],
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 15000,
  },
});
