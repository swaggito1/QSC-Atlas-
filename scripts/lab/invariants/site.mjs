// QSC Atlas Labs: invariants for the qscatlas.org site joins (spec 16.1 to 16.3).
//
// - every annotation row matches exactly one line of its profile in data/profiles, and a row that
//   restates a guide names one that reaches the place and has a milestone in that year;
// - every URL the guide crosswalk maps is an included row of data/results, and every guide in
//   readiness.json has exactly one crosswalk entry;
// - every issuer alias resolves to at least one included document;
// - the EU coordinated roadmap's three target dates agree across readiness.json,
//   exposure/deadlines-extra.json and the Cascade spine event, so the copies cannot drift.
// The profile and document files are read from disk, read-only; the file under check is taken
// from the data passed in, so a proposed patch is checked as it would land.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/common.mjs';

const ANNOTATIONS = 'data/lab/annotations/annotations.json';
const CROSSWALK = 'data/lab/shared/doc-crosswalk.json';
const ALIASES = 'data/lab/shared/issuer-aliases.json';
const READINESS = 'data/lab/readiness/readiness.json';
const EXTRAS = 'data/lab/exposure/deadlines-extra.json';
const SPINE = 'data/lab/cascade/spine.json';
const MEMBERSHIPS = 'data/lab/shared/memberships.json';

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const readIf = (rel, fallback) => (existsSync(join(ROOT, rel)) ? readJson(rel) : fallback);

/** The numeric-year lines of a profile's Migration Timeline, as src/lib/parse.ts reads them. */
function timelineLines(iso3) {
  const path = join(ROOT, 'data', 'profiles', `${iso3}.json`);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8')).migrationTimeline;
  if (typeof raw !== 'string') return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [yearPart, ...rest] = line.split('|');
      const y = yearPart.trim();
      const range = y.match(/^(\d{4})\s*-\s*(\d{4})$/);
      const year = /^\d+$/.test(y) ? Number(y) : range ? Number(range[2]) : null;
      return { year, label: rest.join('|').trim() };
    })
    .filter((l) => l.year !== null);
}

/** The instruments of a profile's Main Regulation ("instrument | level | status" per line). */
function regulationLines(iso3) {
  const path = join(ROOT, 'data', 'profiles', `${iso3}.json`);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8')).mainRegulation;
  if (typeof raw !== 'string') return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.split('|')[0].trim())
    .filter(Boolean);
}

let docs;
/** Every row of data/results: { url, country, issuingOrg, included }. */
function documents() {
  if (docs) return docs;
  const dir = join(ROOT, 'data', 'results');
  docs = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    : [];
  return docs;
}

// ---- the EU roadmap's dates -------------------------------------------------------------------

const EU_GUIDE = 'eu-roadmap';
const EU_EXTRA = /^eu-pqc-roadmap-/;
const EU_SPINE = 'eu-nis-cg-roadmap';

/** The roadmap's targets as "YYYY-MM" from each of the three files. */
function roadmapDates({ readiness, extras, spine }) {
  const guide = (readiness.frameworks ?? []).find((f) => f.id === EU_GUIDE);
  const fromGuide = (guide?.milestones ?? []).map((m) => `${m.year}-${String(m.month ?? 0).padStart(2, '0')}`).sort();
  const fromExtras = (extras.deadlines ?? [])
    .filter((d) => EU_EXTRA.test(d.id) && typeof d.date === 'string')
    .map((d) => d.date.slice(0, 7))
    .sort();
  const event = (spine.spine ?? []).find((s) => s.id === EU_SPINE);
  // the spine event states its targets in words ("by the end of 2026"); read the years it names
  const fromSpine = event ? [...new Set((event.label.match(/\b20\d{2}\b/g) ?? []).map(Number))] : null;
  return { guide, fromGuide, fromExtras, event, fromSpine };
}

function checkRoadmap(files) {
  const out = [];
  const { guide, fromGuide, fromExtras, event, fromSpine } = roadmapDates(files);
  if (!guide) return [{ path: ['frameworks'], message: `readiness.json has no ${EU_GUIDE} guide` }];
  if (fromGuide.length !== 3) out.push({ path: ['frameworks'], message: `the EU roadmap should carry three target dates in readiness.json; it carries ${fromGuide.length}` });
  if (fromGuide.join() !== fromExtras.join()) {
    out.push({ path: ['deadlines'], message: `the EU roadmap's dates differ: readiness.json ${fromGuide.join(', ')}, deadlines-extra.json ${fromExtras.join(', ')}` });
  }
  if (!event) {
    out.push({ path: ['spine'], message: `cascade/spine.json has no ${EU_SPINE} event` });
  } else {
    const years = new Set(fromGuide.map((d) => Number(d.slice(0, 4))));
    const published = Number(String(event.date ?? '').slice(0, 4));
    const stray = fromSpine.filter((y) => y > published && !years.has(y));
    if (stray.length) out.push({ path: ['spine'], message: `the spine event names ${stray.join(', ')}, which is not one of the roadmap's target years (${[...years].join(', ')})` });
    if (!fromSpine.some((y) => years.has(y))) out.push({ path: ['spine'], message: 'the spine event names none of the roadmap target years' });
  }
  return out;
}

// ---- the rules --------------------------------------------------------------------------------

export default [
  {
    id: 'site-annotations-match',
    describe: 'Every annotation row matches exactly one line of its profile in data/profiles (year and a substring of the label, or a substring of the instrument).',
    appliesTo: (rel) => rel === ANNOTATIONS,
    check({ data }) {
      const out = [];
      const ids = new Set();
      (data.dates ?? []).forEach((row, i) => {
        if (ids.has(row.id)) out.push({ path: ['dates', i, 'id'], message: `id ${row.id} is used twice` });
        ids.add(row.id);
        const lines = timelineLines(row.iso3);
        if (lines === null) return out.push({ path: ['dates', i, 'iso3'], message: `no profile data/profiles/${row.iso3}.json` });
        const hits = lines.filter((l) => l.year === row.year && l.label.includes(row.match));
        if (hits.length !== 1) {
          out.push({ path: ['dates', i, 'match'], message: `matches ${hits.length} lines of ${row.iso3}'s timeline for ${row.year}; it must match exactly one` });
        }
      });
      (data.instruments ?? []).forEach((row, i) => {
        if (ids.has(row.id)) out.push({ path: ['instruments', i, 'id'], message: `id ${row.id} is used twice` });
        ids.add(row.id);
        const lines = regulationLines(row.iso3);
        if (lines === null) return out.push({ path: ['instruments', i, 'iso3'], message: `no profile data/profiles/${row.iso3}.json` });
        const hits = lines.filter((l) => l.includes(row.match));
        if (hits.length !== 1) out.push({ path: ['instruments', i, 'match'], message: `matches ${hits.length} regulation lines of ${row.iso3}; it must match exactly one` });
      });
      // a restated line names a guide that reaches the place (its own jurisdiction, or the EU
      // roadmap for a Member State, the rule of src/lib/site/dates.ts) and has a milestone in that
      // year, and no more lines restate a guide's year than it has milestones: otherwise Target
      // dates would keep a line the evidence block drops, or the reverse
      const frameworks = new Map((readIf(READINESS, { frameworks: [] }).frameworks ?? []).map((f) => [f.id, f]));
      const eu = new Set(((readIf(MEMBERSHIPS, { lists: [] }).lists ?? []).find((l) => l.id === 'eu')?.members ?? []).map((m) => m.iso3));
      const taken = new Map();
      (data.dates ?? []).forEach((row, i) => {
        if (!row.restates) return;
        const g = frameworks.get(row.restates);
        if (!g) return out.push({ path: ['dates', i, 'restates'], message: `no guide ${row.restates} in readiness.json` });
        const reaches = g.jurisdiction === row.iso3 || (g.id === EU_GUIDE && row.iso3 !== 'EUU' && eu.has(row.iso3));
        if (!reaches) out.push({ path: ['dates', i, 'restates'], message: `${row.restates} does not reach ${row.iso3}: it is issued for ${g.jurisdiction}${g.id === EU_GUIDE ? ' and EU Member States' : ''}` });
        const room = (g.milestones ?? []).filter((m) => m.year === row.year).length;
        if (!room) out.push({ path: ['dates', i, 'year'], message: `${row.restates} has no milestone in ${row.year}` });
        const key = `${row.iso3}|${row.restates}|${row.year}`;
        taken.set(key, (taken.get(key) ?? 0) + 1);
        if (room && taken.get(key) > room) out.push({ path: ['dates', i], message: `more ${row.iso3} lines restate ${row.restates} in ${row.year} than it has milestones that year` });
      });
      return out;
    },
  },
  {
    id: 'site-crosswalk',
    describe: 'Every URL the guide crosswalk maps is an included row of data/results, and every guide in readiness.json has exactly one crosswalk entry.',
    appliesTo: (rel) => rel === CROSSWALK,
    check({ data }) {
      const out = [];
      const included = new Set(documents().filter((d) => d.included === true && d.url).map((d) => d.url));
      const all = new Set(documents().map((d) => d.url));
      const seen = new Map();
      (data.guides ?? []).forEach((g, i) => {
        seen.set(g.id, (seen.get(g.id) ?? 0) + 1);
        (g.urls ?? []).forEach((u, j) => {
          if (!all.has(u)) out.push({ path: ['guides', i, 'urls', j], message: `${u} is not a row of data/results (write it exactly as data/results does)` });
          else if (!included.has(u)) out.push({ path: ['guides', i, 'urls', j], message: `${u} is in data/results but not included, so it has no public record` });
        });
      });
      const guides = (readIf(READINESS, { frameworks: [] }).frameworks ?? []).map((f) => f.id);
      for (const id of guides) {
        if (!seen.has(id)) out.push({ path: ['guides'], message: `guide ${id} in readiness.json has no crosswalk entry; map it or set unmapped: true with a note` });
      }
      for (const [id, n] of seen) {
        if (n > 1) out.push({ path: ['guides'], message: `guide ${id} has ${n} entries; it needs one` });
        if (!guides.includes(id)) out.push({ path: ['guides'], message: `${id} is not a guide in readiness.json` });
      }
      return out;
    },
  },
  {
    id: 'site-issuer-aliases',
    describe: 'Every issuer alias resolves to at least one included document recorded under that organisation and country.',
    appliesTo: (rel) => rel === ALIASES,
    check({ data }) {
      const out = [];
      const pairs = new Set(documents().filter((d) => d.included === true).map((d) => `${String(d.country).toUpperCase()}|${d.issuingOrg}`));
      const rows = new Set();
      (data.aliases ?? []).forEach((a, i) => {
        if (!pairs.has(`${a.iso3}|${a.issuingOrg}`)) out.push({ path: ['aliases', i], message: `no included document of ${a.iso3} is recorded under "${a.issuingOrg}"` });
        const key = `${a.alias}|${a.issuingOrg}|${a.iso3}`;
        if (rows.has(key)) out.push({ path: ['aliases', i], message: 'this row is listed twice' });
        rows.add(key);
        if (a.alias === a.issuingOrg) out.push({ path: ['aliases', i, 'alias'], message: 'the alias is the recorded name itself' });
      });
      return out;
    },
  },
  {
    id: 'site-eu-roadmap-dates',
    describe: "The EU coordinated roadmap's three target dates agree across readiness.json, exposure/deadlines-extra.json and the Cascade spine event.",
    appliesTo: (rel) => rel === READINESS || rel === EXTRAS || rel === SPINE,
    check({ rel, data }) {
      const files = {
        readiness: rel === READINESS ? data : readIf(READINESS, { frameworks: [] }),
        extras: rel === EXTRAS ? data : readIf(EXTRAS, { deadlines: [] }),
        spine: rel === SPINE ? data : readIf(SPINE, { spine: [] }),
      };
      return checkRoadmap(files);
    },
  },
];
