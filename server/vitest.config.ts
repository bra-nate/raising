import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Load test env BEFORE the prisma singleton (which reads DATABASE_URL at import) is constructed.
dotenv.config({ path: '.env.test' });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    setupFiles: ['./src/test/setup.ts'],
    fileParallelism: false, // tests share one DB; run files serially
    hookTimeout: 30000,
  },
});
