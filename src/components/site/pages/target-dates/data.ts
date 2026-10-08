// Target dates (spec 6.3): everything the page reads, computed once at build time.
//
// The rows are datesFor() over every place that has a dated row (src/lib/site/dates.ts), so a
// production build carries no lead and a preview build marks each one. Every href the island may
// use is computed here through link() and pageHref(), so a destination that is not built in this
// build is null and the island never names it. Posture words and colours come from POSTURE_META
// (src/lib/process.ts) and bindingness words from src/lib/regulation.ts, never written out here.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CopyFileSchema } from '../../../../lib/lab/schema';
import { latestVerifiedAt, loadDataset, projectRoot } from '../../../../lib/lab/load';
import type { LoadOptions } from '../../../../lib/lab/load';
import { readReadiness } from '../../../../lib/lab/readiness-data';
import type { SourceEntry } from '../../../../lib/lab/format';
import { INSTRUMENT_STATUS_META } from '../../../../lib/regulation';
import { REREAD, datePlaces, datesFor, guidesReaching } from '../../../../lib/site/dates';
import { loadAnnotations } from '../../../../lib/site/annotations';
import { euMembers, exposurePlaces, fileExists, guides, nameInSentence, placeName, profilesByIso3 } from '../../../../lib/site/joins';
import { link, pageHref } from '../../../../lib/site/gates';
import { fill } from './model';
import type { TdCopy, TdLinks, TdPlace, TdRow } from './model';

const COPY = 'data/lab/dates/copy.json';
const ALIASES = 'data/site/country-aliases.json';

/**
 * The words of the place search (Swann, 2 October 2026: the search stays, the list of places
 * goes). Drafts for Swann's approval, used until data/lab/dates/copy.json carries its own: a key
 * the copy file sets always wins.
 */
const PICKER_COPY: Record<string, string> = {
  pickListLabel: 'Places with recorded dates',
  pickChosenLabel: 'Chosen places',
  pickRemove: 'Remove {place}',
  pickMatchOne: '1 place matches.',
  pickMatchMany: '{n} places match. Use the up and down arrow keys to move through them.',
  pickMore: '{shown} of {n} places shown. Keep typing to narrow the list.',
  pickAdded: '{place} added.',
  pickRemoved: '{place} removed.',
  pickCleared: 'No place chosen.',
};

export interface TargetDatesData {
  copy: TdCopy;
  rows: TdRow[];
  audiences: Record<string, string>; // guide id to who it is written for, in its own words
  places: TdPlace[];
  links: TdLinks;
  prepare: string | null; // the Prepare hub: "Also used in Prepare", the last row of Where to go next
  reads: { label: string; href: string | null }[];
  timelines: number; // places whose own profile timeline gives at least one row
  guideCount: number; // guides whose dated targets give at least one row
  asOf: string | null;
  sources: SourceEntry[];
  hasLeads: boolean;
  reread: string[]; // places whose dated profile lines stay leads until re-read (spec 6.3), by name
  withheld: { iso3: string; name: string; aliases: string[] }[]; // of those, the ones this build leaves out entirely
}

function readAliases(opts: LoadOptions): Record<string, string[]> {
  if (!fileExists(ALIASES, opts)) return {};
  try {
    const raw = JSON.parse(readFileSync(join(opts.root ?? projectRoot(), ALIASES), 'utf8')) as { aliases?: Record<string, string[]> };
    return raw.aliases ?? {};
  } catch {
    return {};
  }
}

export function targetDatesData(opts: LoadOptions = {}): TargetDatesData {
  const copy = { ...PICKER_COPY, ...(loadDataset(COPY, CopyFileSchema, opts).copy as TdCopy) } as TdCopy;
  // the bindingness words the rest of the Atlas uses ("Soft law", "Guidance")
  copy.bindingness = Object.fromEntries(Object.values(INSTRUMENT_STATUS_META).map((m) => [m.key, m.label]));

  const list = datePlaces(opts);
  const codes = list.map((p) => p.iso3);
  const full = datesFor(codes, opts);
  // the island gets each guide's audience once, not on every row, and none of the fields only the build reads
  const audiences: Record<string, string> = {};
  for (const r of full) if (r.guide && r.audience) audiences[r.guide] = r.audience;
  const rows: TdRow[] = full.map(({ audience: _a, restated: _r, restates: _s, ...r }, i) => ({ ...r, key: `${r.iso3}-${i}` }));

  const profiles = profilesByIso3(opts);
  const members = euMembers(opts);
  const offered = exposurePlaces(opts);
  const aliases = readAliases(opts);

  const places: TdPlace[] = list.map(({ iso3, name }) => {
    const posture = profiles.get(iso3)?.posture ?? null;
    const member = members.has(iso3);
    // the Exposure Clock's jurisdiction: the place itself when the Clock offers it, else the EU for a member
    const j = offered.has(iso3) ? iso3 : member && offered.has('EUU') ? 'EUU' : null;
    return {
      iso3,
      name,
      inSentence: nameInSentence(name),
      posture: posture ? { key: posture.key, short: posture.short, label: posture.label, color: posture.color } : null,
      member,
      aliases: (aliases[iso3] ?? []).filter((a) => a !== name),
      profile: pageHref(`/countries/${iso3.toLowerCase()}`, opts),
      exposure: j ? link('exposure', { query: { j } }, opts) : null,
      rules: member ? link('rulebook', { query: { in: iso3 } }, opts) : null,
      guides: guidesReaching(iso3, opts).map((g) => g.guide.id),
    };
  });

  const usedGuides = [...new Set(rows.filter((r) => r.origin === 'guide' && r.guide).map((r) => r.guide!))];
  const guidePages = Object.fromEntries(guides(opts).map((g) => [g.id, pageHref(`/prepare/guides/${g.id}`, opts)]));
  const links: TdLinks = { check: link('readiness', {}, opts), countries: pageHref('/countries', opts), guidePages };

  const timelines = new Set(rows.filter((r) => r.origin === 'profile').map((r) => r.iso3)).size;
  const reads = [
    { label: fill(copy.readsTimelines, { n: timelines }), href: pageHref('/countries', opts) },
    { label: fill(copy.readsGuides, { n: usedGuides.length }), href: pageHref('/prepare/guides', opts) },
  ];

  // As of: the latest of the profiles' Updated dates and the dates the guides and any confirmed
  // annotation were checked
  const readiness = fileExists('data/lab/readiness/readiness.json', opts) ? readReadiness(opts) : { frameworks: [], documents: [] };
  const used = readiness.frameworks.filter((f) => usedGuides.includes(f.id));
  const updated = [...new Set(rows.filter((r) => r.origin === 'profile').map((r) => r.iso3))]
    .map((c) => profiles.get(c)?.lastUpdated ?? null)
    .filter((d): d is string => Boolean(d));
  const checked = [latestVerifiedAt(used), latestVerifiedAt(loadAnnotations(opts).dates.filter((a) => !a.verify))].filter((d): d is string => Boolean(d));
  const asOf = [...updated, ...checked].sort().at(-1) ?? null;

  // Sources: each guide whose targets are drawn, then the address of each annotation row in use
  const printed = new Map(readiness.documents.map((d) => [d.url, d.date]));
  const sources: SourceEntry[] = [];
  const seen = new Set<string>();
  const add = (p: { url: string; title?: string; publisher?: string; retrievedAt?: string }, author: string) => {
    if (seen.has(p.url)) return;
    seen.add(p.url);
    const date = printed.get(p.url) ?? null;
    // a page with no printed date is cited with the day it was read
    sources.push({ author, date, title: p.title ?? p.url, url: p.url, ...(date ? {} : p.retrievedAt ? { retrievedAt: p.retrievedAt } : {}) });
  };
  for (const f of used) {
    const p = f.milestones[0]?.provenance[0] ?? f.provenance[0];
    if (p) add({ url: p.url, title: p.title ?? f.label, publisher: p.publisher, retrievedAt: p.retrievedAt }, p.publisher ?? f.issuer);
  }
  const notes = loadAnnotations(opts).dates;
  for (const r of rows) {
    if (r.origin !== 'profile' || !r.sourceUrl) continue;
    const note = notes.find((a) => a.iso3 === r.iso3 && a.year === r.year && r.label.includes(a.match));
    const p = note?.provenance[0];
    if (p) add({ url: p.url, title: p.title, publisher: p.publisher, retrievedAt: p.retrievedAt }, p.publisher ?? p.title ?? p.url);
  }

  // the places whose profile lines wait for a re-read at the primary (dates.ts, REREAD): named in
  // About this view, and, where this build leaves them out, answered by name in the place search
  const reread = [...REREAD].filter((c) => (profiles.get(c)?.timeline ?? []).some((l) => typeof l.year === 'number'));
  const withheld = reread
    .filter((c) => !codes.includes(c))
    .map((iso3) => ({ iso3, name: placeName(iso3, opts), aliases: aliases[iso3] ?? [] }));

  return {
    copy,
    rows,
    audiences,
    places,
    links,
    prepare: pageHref('/prepare', opts),
    reads,
    timelines,
    guideCount: usedGuides.length,
    asOf,
    sources,
    hasLeads: rows.some((r) => r.lead),
    reread: reread.map((c) => placeName(c, opts)),
    withheld,
  };
}
