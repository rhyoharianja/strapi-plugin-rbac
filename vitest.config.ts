import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the pure enforcement logic is unit-tested; it is deliberately free of Strapi
    // imports so the regression suite runs without booting an application.
    include: ['server/src/**/*.test.ts'],
    environment: 'node',
  },
});
