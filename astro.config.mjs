// @ts-check
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// QSC Atlas: a static site.
// Content is pulled from Notion at BUILD TIME by the custom loader in
// src/loaders/notion.ts (wired up in src/content.config.ts). Nothing talks to
// Notion while a visitor is browsing; the site only changes when it is rebuilt.

const ROOT = fileURLToPath(new URL('./', import.meta.url));
export const GATED_COMPONENTS = 'virtual:atlas-gated-components';
const RESOLVED = `\0${GATED_COMPONENTS}`;

/**
 * src/lib/site/routes.ts, the manifest of gated pages. Node strips its types itself from 22.18
 * (CI uses 24); an older Node on a build machine loads it through a short-lived Vite server
 * instead, as Astro does for its own config, so the build never depends on the Node version.
 * @param {boolean} [native] false skips straight to Vite (the routes test covers both paths)
 * @returns {Promise<typeof import('./src/lib/site/routes.ts')>}
 */
export async function loadRoutesModule(native = true) {
  if (native) {
    try {
      return await import('./src/lib/site/routes.ts');
    } catch (e) {
      if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ERR_UNKNOWN_FILE_EXTENSION')) throw e;
    }
  }
  const { createServer } = await import('vite');
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
  });
  try {
    return /** @type {any} */ (await server.ssrLoadModule('/src/lib/site/routes.ts'));
  } finally {
    await server.close();
  }
}

/**
 * The source of the module that hands src/pages/[...gated].astro its components. A build imports
 * only the components of the pages it generates (builtPages() in src/lib/site/routes.ts), so a
 * production build with every tool private carries no tool code at all, not even an unlinked
 * script. A tool of site ai is never imported; a research tool only where its page is built.
 * @param {Record<string, string | undefined>} env
 * @param {boolean} [native] passed to loadRoutesModule
 */
export async function gatedComponentsSource(env = process.env, native = true) {
  const { builtPages } = await loadRoutesModule(native);
  const pages = builtPages({ env, root: ROOT });
  const toolIds = [...new Set(pages.flatMap((p) => (p.toolId ? [p.toolId] : [])))];
  const keys = [...new Set(pages.map((p) => p.key))];
  const lines = [];
  const entries = (kind, names, file) =>
    names
      .filter((name) => existsSync(file(name)))
      .map((name, i) => {
        lines.push(`import ${kind}${i} from ${JSON.stringify(file(name))};`);
        return `${JSON.stringify(name)}: ${kind}${i}`;
      });
  const tools = entries('T', toolIds, (id) => `${ROOT}src/components/lab/tools/${id}/index.astro`);
  const views = entries('P', keys, (key) => `${ROOT}src/components/site/pages/${key}/index.astro`);
  lines.push(`export const TOOL_COMPONENTS = { ${tools.join(', ')} };`);
  lines.push(`export const PAGE_COMPONENTS = { ${views.join(', ')} };`);
  return lines.join('\n');
}

// In npm run dev every component is found by a glob, so a folder another package adds appears
// on the next reload; every Atlas page is shown in a local build anyway.
const DEV_SOURCE = `
const byFolder = (mods) => Object.fromEntries(Object.entries(mods).map(([path, mod]) => [path.split('/').at(-2), mod.default]));
export const TOOL_COMPONENTS = byFolder(import.meta.glob('/src/components/lab/tools/*/index.astro', { eager: true }));
export const PAGE_COMPONENTS = byFolder(import.meta.glob('/src/components/site/pages/*/index.astro', { eager: true }));
`;

/** @returns {import('vite').Plugin} */
function gatedComponents() {
  let command = 'serve';
  return {
    name: 'atlas-gated-components',
    configResolved(config) {
      command = config.command;
    },
    resolveId(id) {
      return id === GATED_COMPONENTS ? RESOLVED : null;
    },
    async load(id) {
      if (id !== RESOLVED) return null;
      return command === 'build' ? gatedComponentsSource() : DEV_SOURCE;
    },
  };
}

export default defineConfig({
  // The Atlas's own origin. src/lib/site/config.ts (siteOrigin) reads it, and canonical tags,
  // the sitemap, robots.txt, citations and sharing tags follow, so the move to
  // https://qscatlas.org is this one line. Change it only after Swann has verified the domain in
  // Vercel (spec 15.2); vercel.json gains the old-host redirect in the same commit, on its own
  // branch. The steps, the commands and the checks are in docs/site/domain-move.md.
  site: 'https://www.qscatlas.app',
  // React renders the interactive islands (the map, the globe and the tools), drawn with d3.
  integrations: [react()],
  vite: {
    plugins: [gatedComponents()],
  },
  // Default output is static, which is exactly what we want for Vercel.
});
