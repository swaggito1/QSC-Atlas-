import { loadEnv } from './env.mjs';
import * as FirecrawlNS from 'firecrawl';

loadEnv();

// The package exports the client as a named or default export depending on version.
const Firecrawl = FirecrawlNS.Firecrawl ?? FirecrawlNS.default ?? FirecrawlNS;

const apiKey = process.env.FIRECRAWL_API_KEY;
const baseUrl = process.env.FIRECRAWL_BASE_URL; // optional self-host

let client = null;

export function getFirecrawl() {
  if (!apiKey && !baseUrl) {
    throw new Error(
      'FIRECRAWL_API_KEY is not set. Get a key at https://firecrawl.dev and add it to ~/qsc-atlas/.env',
    );
  }
  if (!client) {
    const opts = {};
    if (apiKey) opts.apiKey = apiKey;
    if (baseUrl) opts.apiUrl = baseUrl;
    client = new Firecrawl(opts);
  }
  return client;
}

// Firecrawl's search response shape varies by version; pull out the result array.
function normalise(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  for (const k of ['web', 'data', 'results']) {
    if (Array.isArray(res[k])) return res[k];
  }
  if (res.data && Array.isArray(res.data.web)) return res.data.web;
  return [];
}

/**
 * Search the web. Returns [{ title, url, description, markdown }].
 * To minimise Firecrawl credits, page content is NOT scraped by default
 * (search alone is far cheaper). Pass { scrape: true } to also fetch markdown.
 */
export async function search(query, opts = {}) {
  const fc = getFirecrawl();
  const params = {
    limit: opts.limit ?? 5,
    sources: opts.sources ?? ['web'],
  };
  if (opts.scrape) params.scrapeOptions = { formats: ['markdown'] };
  const res = await fc.search(query, params);
  return normalise(res)
    .map((r) => ({
      title: r.title ?? r.metadata?.title ?? null,
      url: r.url ?? r.metadata?.sourceURL ?? null,
      description: r.description ?? null,
      markdown: r.markdown ?? r.content ?? null,
    }))
    .filter((r) => r.url);
}
