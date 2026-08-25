import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Browser-side specs opt into jsdom with a `@vitest-environment` pragma on
    // their first line; the host-side provider spec needs none.
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
  },
})
