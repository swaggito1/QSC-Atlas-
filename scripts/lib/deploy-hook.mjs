import { loadEnv } from './env.mjs';

loadEnv();

/**
 * Fire the Vercel deploy hook to trigger a rebuild (which re-fetches Notion).
 * No-op if DEPLOY_HOOK_URL is not set, so local runs do not fail.
 */
export async function fireDeployHook() {
  const url = process.env.DEPLOY_HOOK_URL;
  if (!url) {
    console.log('[deploy-hook] DEPLOY_HOOK_URL not set; skipping rebuild trigger.');
    return false;
  }
  try {
    const res = await fetch(url, { method: 'POST' });
    console.log(`[deploy-hook] POST -> ${res.status}`);
    return res.ok;
  } catch (err) {
    console.log(`[deploy-hook] failed: ${err?.message ?? err}`);
    return false;
  }
}
