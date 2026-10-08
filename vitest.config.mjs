// Vitest runs the QSC Atlas Labs and site tests (npm run lab:test), the site checks' own included.
import { defineConfig } from 'vitest/config';
import astroConfig from './astro.config.mjs';

export default defineConfig({
  test: {
    // tool folders may hold their own tests (some folders exist only on this machine)
    include: [
      'src/lib/lab/**/*.test.ts',
      'src/lib/site/**/*.test.ts',
      'scripts/lab/**/*.test.mjs',
      'scripts/site/**/*.test.mjs',
      'src/components/lab/tools/**/*.test.ts',
      'src/components/site/pages/**/*.test.ts',
    ],
    environment: 'node',
    // the same `site` Astro gives every module as import.meta.env.SITE (src/lib/site/config.ts)
    env: { SITE: String(astroConfig.site ?? '') },
  },
});
