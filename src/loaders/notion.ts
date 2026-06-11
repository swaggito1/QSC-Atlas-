import type { Loader, LoaderContext } from 'astro/loaders';
import { Client } from '@notionhq/client';

/**
 * Custom Astro Content Layer loader for Notion.
 *
 * Reads every row of a Notion data source at BUILD TIME using the official
 * Notion SDK (v5, data sources API), maps each row to a plain object, validates
 * it against the collection schema, and stores it as a content entry.
 *
 * The IDs passed in are Notion DATA SOURCE (collection) IDs, which is what
 * notion.dataSources.query expects in the 2025+ API.
 *
 * If NOTION_TOKEN is not set, the loader logs a warning and stores nothing, so
 * the site still builds with empty collections instead of crashing.
 */

const TOKEN = process.env.NOTION_TOKEN ?? import.meta.env.NOTION_TOKEN;
const notion = TOKEN ? new Client({ auth: TOKEN }) : null;

type Props = Record<string, any>;

// ---- Notion property extractors: raw API property -> plain JS value ----

function joinRich(arr: any[] | undefined): string | null {
  if (!arr || arr.length === 0) return null;
  const s = arr.map((t) => t?.plain_text ?? '').join('').trim();
  return s === '' ? null : s;
}

/** title or rich_text property -> string | null */
export function txt(p: Props, name: string): string | null {
  const prop = p[name];
  if (!prop) return null;
  if (prop.type === 'title') return joinRich(prop.title);
  if (prop.type === 'rich_text') return joinRich(prop.rich_text);
  return null;
}
export function num(p: Props, name: string): number | null {
  const prop = p[name];
  return prop?.type === 'number' ? prop.number ?? null : null;
}
export function sel(p: Props, name: string): string | null {
  const prop = p[name];
  return prop?.type === 'select' ? prop.select?.name ?? null : null;
}
export function multi(p: Props, name: string): string[] {
  const prop = p[name];
  return prop?.type === 'multi_select' ? prop.multi_select.map((o: any) => o.name) : [];
}
export function date(p: Props, name: string): string | null {
  const prop = p[name];
  return prop?.type === 'date' ? prop.date?.start ?? null : null;
}
export function bool(p: Props, name: string): boolean {
  const prop = p[name];
  return prop?.type === 'checkbox' ? !!prop.checkbox : false;
}
export function url(p: Props, name: string): string | null {
  const prop = p[name];
  return prop?.type === 'url' ? prop.url ?? null : null;
}

export interface NotionLoaderOptions {
  /** Notion DATA SOURCE (collection) ID. */
  dataSourceId: string;
  /** Map a Notion page to entry data. MUST include a unique string `id`. Return null to skip the row. */
  map: (page: any) => (Record<string, unknown> & { id: string }) | null;
  /** Optional Notion API filter (e.g. only Published rows). */
  filter?: Record<string, unknown>;
}

export function notionLoader(opts: NotionLoaderOptions): Loader {
  const tag = opts.dataSourceId.replace(/-/g, '').slice(0, 8);
  return {
    name: `notion-${tag}`,
    async load({ store, logger, parseData, generateDigest }: LoaderContext): Promise<void> {
      store.clear();
      if (!notion) {
        logger.warn(
          `NOTION_TOKEN not set - skipping fetch for ${tag}; this collection will be empty. Add NOTION_TOKEN to .env to load live data.`,
        );
        return;
      }
      let cursor: string | undefined;
      let count = 0;
      try {
        do {
          const res: any = await notion.dataSources.query({
            data_source_id: opts.dataSourceId,
            start_cursor: cursor,
            page_size: 100,
            ...(opts.filter ? { filter: opts.filter } : {}),
          });
          for (const page of res.results) {
            const data = opts.map(page);
            if (!data) continue;
            const parsed = await parseData({ id: data.id, data });
            store.set({ id: data.id, data: parsed, digest: generateDigest(parsed) });
            count++;
          }
          cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
        } while (cursor);
        logger.info(`Loaded ${count} rows from Notion (${tag}).`);
      } catch (err: any) {
        logger.error(
          `Notion fetch failed for ${tag}: ${err?.message ?? err}. Building with whatever loaded so far.`,
        );
      }
    },
  };
}
