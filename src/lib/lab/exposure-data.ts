// QSC Atlas Labs: the Exposure Clock's data, assembled at build time for the island.
// Reads the survey editions, presets, sourced extra dates and copy under data/lab/exposure/,
// the Atlas profiles through atlas.ts and the line annotations (data/lab/annotations), and
// precomputes each place's target dates so the browser does no data work. Every address the
// island links to is built here through link() and pageHref(), so a page that is not built is
// never named and the island holds no route string. In production, leads (verify: true) are
// dropped by loadDataset before anything reaches the page.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { CopyFileSchema, DeadlinesExtraFileSchema, PresetsFileSchema, SurveyFileSchema } from './schema';
import { isProduction, latestVerifiedAt, loadDataset, projectRoot } from './load';
import type { LoadOptions } from './load';
import { getProfiles, listCountries } from './atlas';
import { POSTURE_META, POSTURE_ORDER } from '../process';
import type { CoordinationPosture } from '../process';
import { fill, mergeDeadlines } from './exposure';
import type { ClockDeadline, ExtraDeadline, RoadmapDecision, ShelfPeriod, SurveyForClock } from './exposure';
import { sourceWordsInBuild } from '../site/review-build';
import type { SourceEntry } from './format';
import { siteOrigin } from '../site/config';
import { link, pageHref } from '../site/gates';
import { loadAnnotations } from '../site/annotations';
import { guides, isEuMember, nameInSentence } from '../site/joins';
import type { LineAnnotation } from './exposure';

export interface ClockPreset {
  id: string;
  label: string;
  description: string;
  publicAdmin: boolean;
  // the periods sources document for this kind of data: by place, through the EU, or general
  periods: ShelfPeriod[];
}

export interface ClockJurisdiction {
  iso3: string;
  name: string;
  group: string; // the posture label, used as the select's group heading
  postureColor: string | null;
  eu: boolean; // an EU Member State, which an EU rule for a kind of data can reach
  inSentence: string; // the name inside a sentence: "the United States", "France"
}

/** A profile's coordination posture, named beside the target dates heading as ProcessChip names it. */
export interface ClockPosture {
  label: string;
  short: string;
  color: string;
}

export interface SurveyRow {
  horizonYears: number;
  year: number;
  lower: number;
  upper: number;
  page: string;
  verified: boolean;
}

/** A link of the frame: null when its destination is not built, and then it is not rendered. */
export interface FrameLink {
  label: string;
  href: string | null;
}

/** The links the island draws under the target dates, by ISO3 ("EUU" included), built at build time. */
export interface ClockLinks {
  compare: Record<string, string>; // "Compare these dates with other places": /target-dates?in={ISO3}, only when that view is built
  profile: Record<string, { href: string; name: string }>; // "Open the {name} profile"
}

export interface ExposureData {
  copy: Record<string, string>;
  survey: SurveyForClock | null;
  surveyRows: SurveyRow[];
  surveyDefinition: string | null;
  surveyStale: boolean;
  presets: ClockPreset[];
  jurisdictions: ClockJurisdiction[];
  deadlines: Record<string, ClockDeadline[]>; // target dates by ISO3, plus "EUU" and "none"
  links: ClockLinks;
  // the frame's props (facts line, "Not for you?", Where to go next); the island never sees them
  frame: { reads: FrameLink[]; notForYou: { text: string; href: string | null } | null; next: FrameLink[] };
  postures: Record<string, ClockPosture>; // by ISO3, plus "EUU"; only where the profile records one
  decisions: Record<string, RoadmapDecision[]>;
  buildYear: number;
  // the Atlas's own address, no trailing slash: a downloaded CSV gives profile links in full
  origin: string;
  asOf: string | null;
  sources: SourceEntry[];
}

const EXPOSURE = 'data/lab/exposure';

type SurveyFile = z.infer<typeof SurveyFileSchema>;

function readSurveys(opts: LoadOptions): SurveyFile[] {
  const dir = join(opts.root ?? projectRoot(), EXPOSURE, 'surveys');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f: string) => f.endsWith('.json'))
    .sort()
    .map((f: string) => loadDataset(`${EXPOSURE}/surveys/${f}`, SurveyFileSchema, opts));
}

const optional = <T>(path: string, fn: () => T, empty: T, opts: LoadOptions): T =>
  existsSync(join(opts.root ?? projectRoot(), path)) ? fn() : empty;

/**
 * The survey edition the clock shows: the latest by base year. In production an edition that
 * is itself a lead is passed over for the latest checked one, so a new report still being
 * checked never takes the band off the page.
 */
export function chooseSurvey<T extends { survey: { baseYear: number; verify?: boolean } }>(surveys: T[], production: boolean): T | null {
  const candidates = production ? surveys.filter((s) => !s.survey.verify) : surveys;
  return [...candidates].sort((a, b) => a.survey.baseYear - b.survey.baseYear).pop() ?? null;
}

type Provenance = { url: string; title?: string; excerpt: string; locator?: string };

/**
 * The report locator for one survey row: the first place in the report itself whose excerpt
 * gives both figures of the row, else every report locator for the row joined.
 */
export function rowLocator(point: { lower: number; upper: number; provenance: Provenance[] }, reportUrl: string): string {
  const gives = (text: string, v: number) => new RegExp(`(^|[^\\d.])${Math.round(v * 100)}\\s?%`).test(text);
  const own = point.provenance.filter((p) => p.url === reportUrl);
  const both = own.find((p) => gives(p.excerpt, point.lower) && gives(p.excerpt, point.upper));
  return both?.locator ?? own.map((p) => p.locator).filter(Boolean).join('; ');
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const two = (n: number | string) => String(n).padStart(2, '0');

/**
 * A document's own date, as its provenance records it: a "Date Published: November 12, 2024"
 * line on a publication page, or a "(11.06.2025)" version date in the title. Null when neither
 * is there, so the sources list says "n.d." and never guesses.
 */
export function documentDate(provenance: Provenance[]): string | null {
  for (const p of provenance) {
    const m = /Date Published:\s*([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(p.excerpt);
    const month = m ? MONTH_NAMES.indexOf(m[1]) : -1;
    if (m && month >= 0) return `${m[3]}-${two(month + 1)}-${two(m[2])}`;
  }
  for (const p of provenance) {
    const m = /\((\d{2})\.(\d{2})\.(\d{4})\)/.exec(p.title ?? '');
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

/**
 * Everything the page needs. `site` is the Atlas's own address (the page passes the `site` that
 * astro.config.mjs names), so the reference to the Atlas follows a change of domain.
 */
export function loadExposure(opts: LoadOptions = {}, now: Date = new Date(), site: string = siteOrigin()): ExposureData {
  const production = isProduction(opts.env);
  const copy = loadDataset(`${EXPOSURE}/copy.json`, CopyFileSchema, opts).copy as Record<string, string>;
  const surveys = readSurveys(opts);
  const presetsFile = optional(`${EXPOSURE}/presets.json`, () => loadDataset(`${EXPOSURE}/presets.json`, PresetsFileSchema, opts), { presets: [] }, opts);
  const extrasFile = optional(`${EXPOSURE}/deadlines-extra.json`, () => loadDataset(`${EXPOSURE}/deadlines-extra.json`, DeadlinesExtraFileSchema, opts), { deadlines: [] }, opts);

  const usable = chooseSurvey(surveys, production);
  const survey: SurveyForClock | null = usable
    ? {
        id: usable.survey.id,
        title: usable.survey.title,
        baseYear: usable.survey.baseYear,
        published: usable.survey.published,
        points: [...usable.points].sort((a, b) => a.horizonYears - b.horizonYears).map((p) => ({ horizonYears: p.horizonYears, lower: p.lower, upper: p.upper })),
        verified: !usable.survey.verify && usable.points.every((p) => !p.verify),
      }
    : null;
  const surveyRows: SurveyRow[] = usable
    ? usable.points.map((p) => ({ horizonYears: p.horizonYears, year: usable.survey.baseYear + p.horizonYears, lower: p.lower, upper: p.upper, page: rowLocator(p, usable.survey.reportUrl), verified: !p.verify }))
    : [];
  const publishedAt = usable ? Date.parse(usable.survey.published.length === 7 ? `${usable.survey.published}-01` : usable.survey.published) : NaN;
  const surveyStale = Number.isFinite(publishedAt) && (now.getTime() - publishedAt) / 86_400_000 > 400;

  // the periods behind "What do you protect?": a fixed period or a duty with no end, each named by
  // its source; the source's own words travel only in a build that may carry them (review.ts)
  const words = sourceWordsInBuild(opts);
  type PresetRecord = (typeof presetsFile.presets)[number]['defaults'][number] | (typeof presetsFile.presets)[number]['noEnd'][number];
  const period = (d: PresetRecord): ShelfPeriod => ({
    iso3: d.iso3,
    euMembers: d.euMembers,
    years: 'years' in d ? d.years : null,
    basis: d.basis,
    basisNote: d.basisNote,
    sourceUrl: d.provenance[0].url,
    sourceName: d.sourceName ?? d.provenance[0].title ?? d.provenance[0].publisher ?? d.provenance[0].url,
    verified: !d.verify,
    words: words ? d.provenance.map((x) => x.excerpt).filter(Boolean) : [],
  });
  const presets: ClockPreset[] = presetsFile.presets.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    publicAdmin: p.publicAdmin,
    periods: [...p.defaults, ...p.noEnd].filter((d) => d.provenance.length > 0).map(period),
  }));

  // jurisdictions with a populated profile, grouped by coordination posture
  const names = new Map(listCountries(opts).map((c) => [c.iso3, c.name]));
  const profiles = getProfiles(opts).filter((p) => p.posture && p.dataStatus !== 'Placeholder');
  const order = (key: string | undefined) => (key ? POSTURE_ORDER.indexOf(key as CoordinationPosture) : 99);
  const jurisdictions: ClockJurisdiction[] = profiles
    .filter((p) => p.iso3 !== 'EUU' && p.iso3 !== 'NATO')
    .sort((a, b) => order(a.posture?.key) - order(b.posture?.key) || (names.get(a.iso3) ?? a.country).localeCompare(names.get(b.iso3) ?? b.country, 'en-GB'))
    .map((p) => {
      const name = names.get(p.iso3) ?? p.country;
      return { iso3: p.iso3, name, group: p.posture!.label, postureColor: p.posture!.color, eu: isEuMember(p.iso3, opts), inSentence: nameInSentence(name) };
    });

  const extras: ExtraDeadline[] = extrasFile.deadlines.map((d) => ({
    id: d.id,
    date: d.date ?? '',
    label: d.label,
    issuer: d.issuer,
    lane: d.lane,
    appliesToPosture: d.appliesToPosture,
    documentStatus: d.documentStatus,
    sourceUrl: d.provenance[0]?.url ?? null,
    sourceLabel: d.provenance[0]?.title ?? d.issuer,
    verified: !d.verify,
  })).filter((d) => d.date);

  const deadlines: Record<string, ClockDeadline[]> = {};
  const postures: Record<string, ClockPosture> = {};
  const decisions: Record<string, RoadmapDecision[]> = {};
  const compare: Record<string, string> = {};
  const profile: Record<string, { href: string; name: string }> = {};
  const euColor = POSTURE_META.EU.color;
  const allProfiles = getProfiles(opts);
  // the annotations of profile lines: leads are kept in preview (marked) and dropped in production
  const annotations = loadAnnotations(opts).dates;
  const roadmapGuide = guides(opts).find((g) => g.id === 'eu-roadmap') ?? null;
  const roadmapBindingness = roadmapGuide ? { bindingness: roadmapGuide.bindingness ?? null, lead: !roadmapGuide.verified } : null;
  const build = (iso3: string, name: string, profileName: string) => {
    const p = allProfiles.find((x) => x.iso3 === iso3);
    if (p?.posture) postures[iso3] = { label: p.posture.label, short: p.posture.short, color: p.posture.color };
    const profileHref = pageHref(`/countries/${iso3.toLowerCase()}`, opts);
    const notes: LineAnnotation[] = annotations
      .filter((a) => a.iso3 === iso3)
      .map((a) => ({ year: a.year, match: a.match, restates: a.restates ?? null, bindingness: a.bindingness ?? null, lead: Boolean(a.verify) }));
    const r = mergeDeadlines({
      jurisdictionName: name,
      iso3,
      posture: iso3 === 'EUU' ? 'EU' : p?.posture?.key ?? null,
      euMember: iso3 === 'EUU' || isEuMember(iso3, opts),
      postureColor: p?.posture?.color ?? (iso3 === 'EUU' ? euColor : null),
      profileLines: p?.timeline ?? [],
      profileVerified: p?.verificationStatus === 'Verified' || p?.verificationStatus === 'Corrected',
      profileHref: profileHref ?? '',
      opacity: p?.opacity ?? 1,
      extras,
      roadmapColor: euColor,
      annotations: notes,
      roadmapBindingness,
    });
    deadlines[iso3] = r.deadlines;
    decisions[iso3] = r.decisions;
    if (profileHref) profile[iso3] = { href: profileHref, name: profileName };
    // the Target dates view compares places that have dates of their own; it is linked only when built
    const own = r.deadlines.some((d) => d.lane !== 'standards');
    const href = own ? link('dates', { query: { in: iso3 } }, opts) : null;
    if (href) compare[iso3] = href;
  };
  for (const j of jurisdictions) build(j.iso3, j.name, j.name);
  // inside a sentence: "Published target dates for the European Union"
  build('EUU', copy.whereEuName ?? 'the European Union', allProfiles.find((x) => x.iso3 === 'EUU')?.country ?? names.get('EUU') ?? 'European Union');
  deadlines.none = extras.filter((e) => e.lane === 'standards' && e.sourceUrl).map((e) => ({
    id: e.id, year: Number(e.date.slice(0, 4)), display: e.date.slice(0, 4), label: e.label, issuer: e.issuer, documentStatus: e.documentStatus, lane: 'standards' as const,
    sourceUrl: e.sourceUrl!, sourceLabel: e.sourceLabel, verified: e.verified, opacity: 1, postureColor: null,
    basis: null, basisLead: false, restated: null,
  }));

  // the facts line: what the clock reads, with counts computed here
  const timelines = [...jurisdictions.map((j) => j.iso3), 'EUU'].filter((iso3) =>
    (allProfiles.find((x) => x.iso3 === iso3)?.timeline ?? []).some((l) => typeof l.year === 'number'),
  ).length;
  // the places with a period of their own for at least one kind of data (the EU counts as one)
  const keeping = new Set(presets.flatMap((p) => p.periods.map((d) => d.iso3)).filter((iso3) => iso3 !== null)).size;
  const datesHref = link('dates', {}, opts);
  const reads: FrameLink[] = [
    ...(timelines ? [{ label: fill(copy.readsTimelines, { n: timelines }), href: datesHref ?? pageHref('/countries', opts) }] : []),
    ...(usable ? [{ label: fill(copy.readsSurvey, { year: usable.survey.baseYear, surveyTitle: usable.survey.title }), href: usable.survey.reportUrl }] : []),
    ...(keeping ? [{ label: fill(copy.readsKeeping, { n: keeping }), href: null }] : []),
  ];
  const frame = {
    reads,
    notForYou: datesHref ? { text: copy.notForYou, href: datesHref } : null,
    // one to three links, one of them back into the evidence; an unbuilt one is dropped here, so
    // its label never reaches the island's props on a build where that page is hidden
    next: [
      { label: copy.nextCheck, href: link('readiness', { query: { action: 'nl-mosca' } }, opts) },
      { label: copy.nextCountries, href: pageHref('/countries', opts) },
      { label: copy.nextDocuments, href: pageHref('/documents', opts) },
    ].filter((n) => n.href !== null),
  };

  const sources: SourceEntry[] = [];
  if (usable) {
    sources.push({
      author: usable.survey.authors.map((a) => { const parts = a.split(' '); return `${parts.pop()}, ${parts.map((x) => x[0] + '.').join(' ')}`; }).join(', & '),
      date: usable.survey.published,
      title: usable.survey.title,
      publisher: usable.survey.publishers.join('; '),
      url: usable.survey.reportUrl,
    });
    const m = usable.method;
    if (m.doi) sources.push({ author: 'Mosca, M.', date: '2018', title: 'Cybersecurity in an era with quantum computers: Will we be ready?', container: 'IEEE Security & Privacy', details: '16(5), 38 to 41', doi: m.doi });
  }
  for (const d of extrasFile.deadlines) {
    const p = d.provenance[0];
    if (!p || sources.some((s) => s.url === p.url)) continue;
    sources.push({ author: d.issuer, date: documentDate(d.provenance), title: p.title ?? d.label, url: p.url, retrievedAt: p.retrievedAt });
  }
  // the texts behind the periods each kind of data starts the shelf life from; consolidated texts
  // carry no single date, so they are cited with the day they were read
  for (const preset of presetsFile.presets) {
    for (const d of [...preset.defaults, ...preset.noEnd]) {
      const p = d.provenance[0];
      if (!p || sources.some((s) => s.url === p.url)) continue;
      sources.push({ author: p.publisher ?? preset.label, date: null, title: p.title ?? d.basisNote, url: p.url, retrievedAt: p.retrievedAt });
    }
  }
  const origin = site.replace(/\/$/, '');
  sources.push({ author: 'QSC Atlas', date: null, title: 'Country profiles and migration timelines', url: `${origin}/countries`, retrievedAt: now.toISOString().slice(0, 10) });

  // the frame's own sentences are spent above; the island gets the rest, so the name of a page this
  // build hides (the Readiness Check in nextCheck) never travels in its props
  const frameKeys = new Set(['readsTimelines', 'readsSurvey', 'readsKeeping', 'notForYou', 'nextCheck', 'nextCountries', 'nextDocuments']);
  const islandCopy = Object.fromEntries(Object.entries(copy).filter(([k]) => !frameKeys.has(k)));

  return {
    copy: islandCopy,
    survey,
    surveyRows,
    surveyDefinition: usable?.survey.definitionVerbatim ?? null,
    surveyStale,
    presets,
    jurisdictions,
    deadlines,
    links: { compare, profile },
    frame,
    postures,
    decisions,
    buildYear: now.getFullYear(),
    origin,
    asOf: latestVerifiedAt({ surveys, presetsFile, extrasFile }),
    sources,
  };
}
