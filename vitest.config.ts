import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Vitest 4 removed `environmentMatchGlobs`; per-file environments are now
    // expressed as named projects. Keying on `*.test.tsx` makes the jsdom opt-in
    // structural so it can't be forgotten on the next component test.
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
})
