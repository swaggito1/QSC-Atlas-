// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// QSC Atlas - a static site.
// Content is pulled from Notion at BUILD TIME by the custom loader in
// src/loaders/notion.ts (wired up in src/content.config.ts). Nothing talks to
// Notion while a visitor is browsing; the site only changes when it is rebuilt.
export default defineConfig({
  // TODO: set this to the real public domain once chosen (used for canonical URLs / sitemap).
  site: 'https://qsc-atlas.vercel.app',
  // React powers the interactive map island (react-simple-maps, added when the map is built).
  integrations: [react()],
  // Default output is static, which is exactly what we want for Vercel.
});
