// QSC Atlas Labs: invariants for the Exposure Clock (prompt 01, and the qscatlas.org exposure
// package).
//
// - every survey range lies between 0 and 1 and never falls as the horizon grows;
// - every extra target date that is not a lead names its source;
// - every annotated profile line that restates the EU coordinated roadmap has a roadmap row of
//   the same year in deadlines-extra.json, so the clock can draw that year once, as the
//   roadmap's own row; without one the line would quietly stay a second mark;
// - each kind of data in presets.json holds at most one period per place (and one general
//   value), only an EU record reaches the Member States, a retention period never stands in for
//   a period of secrecy, and every checked period names its source by a title.
// Files other than the one under check are read from disk, read-only.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/common.mjs';

const ANNOTATIONS = 'data/lab/annotations/annotations.json';
const EXTRAS = 'data/lab/exposure/deadlines-extra.json';
const PRESETS = 'data/lab/exposure/presets.json';

// words that would present a keeping period as a period of secrecy
const SECRECY_CLAIM = /\b(must stay secret|stays? secret|stays? confidential|kept secret|confidential for)\b/i;

const readIf = (rel, fallback) => (existsSync(join(ROOT, rel)) ? JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) : fallback);

export default [
  {
    id: 'survey-ranges',
    describe: 'Every survey range lies between 0 and 1, its lower figure is at most its upper, and both never fall as the horizon grows.',
    appliesTo: (rel) => rel.startsWith('data/lab/exposure/surveys/'),
    check({ data }) {
      const out = [];
      const pts = [...(data.points ?? [])].sort((a, b) => a.horizonYears - b.horizonYears);
      pts.forEach((p, i) => {
        const at = ['points', (data.points ?? []).indexOf(p)];
        if (p.lower < 0 || p.upper > 1) out.push({ path: at, message: 'a figure lies outside 0 to 1' });
        if (p.lower > p.upper) out.push({ path: at, message: `lower ${p.lower} is above upper ${p.upper}` });
        const prev = pts[i - 1];
        if (prev && (p.lower < prev.lower || p.upper < prev.upper)) out.push({ path: at, message: `the range at ${p.horizonYears} years falls below the range at ${prev.horizonYears} years` });
      });
      return out;
    },
  },
  {
    id: 'deadline-sources',
    describe: 'Every extra target date that is not a lead names its source.',
    appliesTo: (rel) => rel === EXTRAS,
    check({ data }) {
      return (data.deadlines ?? []).flatMap((d, i) => (!d.verify && !d.provenance?.[0]?.url ? [{ path: ['deadlines', i], message: 'a checked target date has no source' }] : []));
    },
  },
  {
    id: 'shelf-life-periods',
    describe: 'Each kind of data holds at most one period per place and one general value; only an EU record reaches the Member States; a retention period never claims secrecy; every checked period names its source.',
    appliesTo: (rel) => rel === PRESETS,
    check({ data }) {
      const out = [];
      (data.presets ?? []).forEach((p, i) => {
        const seen = new Map();
        for (const [list, rows] of [['defaults', p.defaults ?? []], ['noEnd', p.noEnd ?? []]]) {
          rows.forEach((d, k) => {
            const at = ['presets', i, list, k];
            const key = d.iso3 ?? 'general';
            if (seen.has(key)) out.push({ path: at, message: `${p.id} already has a period for ${key} (${seen.get(key)}); the tool would show only one` });
            else seen.set(key, `${list}[${k}]`);
            if (d.euMembers && d.iso3 !== 'EUU') out.push({ path: at, message: 'only an EU record (iso3 "EUU") can reach the Member States' });
            if (d.basis === 'retention' && SECRECY_CLAIM.test(d.basisNote ?? '')) out.push({ path: [...at, 'basisNote'], message: 'a retention period is how long a record is kept; its note must not present it as a period of secrecy' });
            if (!d.verify && !d.provenance?.[0]?.title) out.push({ path: [...at, 'provenance', 0], message: 'a checked period names no source title for the page to link' });
          });
        }
      });
      return out;
    },
  },
  {
    id: 'exposure-roadmap-folds',
    describe: 'Every annotated profile line that restates the EU roadmap has a sourced roadmap row of the same year for the Exposure Clock to draw in its place.',
    appliesTo: (rel) => rel === ANNOTATIONS || rel === EXTRAS,
    check({ rel, data }) {
      const annotations = rel === ANNOTATIONS ? data : readIf(ANNOTATIONS, { dates: [] });
      const extras = rel === EXTRAS ? data : readIf(EXTRAS, { deadlines: [] });
      const years = new Set(
        (extras.deadlines ?? []).filter((d) => d.lane === 'roadmap' && d.provenance?.[0]?.url && d.date).map((d) => Number(String(d.date).slice(0, 4))),
      );
      const out = [];
      (annotations.dates ?? []).forEach((a, i) => {
        if (a.restates !== 'eu-roadmap' || years.has(a.year)) return;
        const message = `${a.iso3} ${a.year} restates the EU roadmap, but no roadmap row of ${a.year} is in deadlines-extra.json`;
        out.push(rel === ANNOTATIONS ? { path: ['dates', i], message } : { path: ['deadlines'], message });
      });
      return out;
    },
  },
];
