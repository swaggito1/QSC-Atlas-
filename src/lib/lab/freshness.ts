// QSC Atlas Labs: how old a verified value may grow before it is flagged as stale.
// Keyed by the folder under data/lab/. Read by FreshnessBadge.astro and by
// scripts/lab/freshness.mjs, so the page and the monthly issue always agree.

export const FRESHNESS_DAYS: Record<string, number> = {
  exposure: 400, // the expert survey is annual
  cascade: 180,
  rulebook: 90, // legal status moves fastest
  shared: 365, // EU and NATO membership lists
  readiness: 180, // migration frameworks are revised every year or two
};

export const DEFAULT_FRESHNESS_DAYS = 180;

/** Threshold for a tool id or a data/lab folder name. */
export function freshnessDays(toolOrFolder: string): number {
  return FRESHNESS_DAYS[toolOrFolder] ?? DEFAULT_FRESHNESS_DAYS;
}

/** Whole days from an ISO date (YYYY-MM-DD) to `now`. */
export function daysSince(isoDay: string, now: Date = new Date()): number {
  const then = Date.parse(isoDay + 'T00:00:00Z');
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - then) / 86_400_000);
}
