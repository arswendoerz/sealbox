import { defineConfig } from 'vitest/config';

// Unit tests run in Node (Web Crypto, atob/btoa are built in). Supabase is always mocked:
// tests never talk to a real project.
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    testTimeout: 30_000, // PBKDF2 runs in a few tests
  },
});
