// QSC Atlas Labs: the shared invariants every lab dataset must satisfy.
// Each rule receives { rel, data } (a file path relative to the repository root and its
// parsed JSON) plus { today }, and returns a list of { path, message } failures.
// Tool prompts add their own rules in scripts/lab/invariants/<tool>.mjs; validate-core.mjs
// loads every file in that folder.

import { scanString } from '../../../labs/tools/style-scan.mjs';
import { walkJson, wordCount } from './common.mjs';

export const MAX_EXCERPT_WORDS = 60;

// Keys whose values are quoted verbatim from a source: exempt from the style rule.
export const VERBATIM_KEYS = new Set(['excerpt', 'documentTitle', 'definitionVerbatim', 'sourceTitle', 'quote']);

// Keys that present a date of application or entry into force as current. A record whose
// current status is "proposal" must not carry any of them; a proposed date belongs under
// a "proposed" object instead (for example proposed.appliesFrom), which makes its status plain.
export const APPLICATION_DATE_KEYS = [
  'appliesFrom',
  'applicationDate',
  'dateOfApplication',
  'entryIntoForce',
  'entryIntoForceDate',
  'inForceFrom',
  'inForceDate',
];

const ISO = {
  day: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-\d{2}$/,
  year: /^\d{4}$/,
};

/** First day of the period an ISO date names: "2024-08" gives "2024-08-01". */
export function periodStart(date) {
  if (ISO.day.test(date)) return date;
  if (ISO.month.test(date)) return `${date}-01`;
  if (ISO.year.test(date)) return `${date}-01-01`;
  return null;
}

const isProvenance = (v) =>
  v && typeof v === 'object' && !Array.isArray(v) && 'url' in v && 'retrievedAt' in v && 'sourceClass' in v;

/** The current lifecycle status of a record: its status field, else its last history entry. */
export function currentStatus(record) {
  if (typeof record.status === 'string') return record.status;
  const h = Array.isArray(record.statusHistory) ? record.statusHistory : null;
  return h && h.length ? h[h.length - 1].status : null;
}

// ---- the rules --------------------------------------------------------------

export const evidence = {
  id: 'evidence',
  describe: 'Every record with verify: false has a verifiedAt date and at least one provenance entry with url, retrievedAt and a verbatim excerpt of 60 words or fewer.',
  check({ data }) {
    const out = [];
    walkJson(data, (v, path) => {
      if (isProvenance(v)) {
        const n = wordCount(v.excerpt ?? '');
        if (n > MAX_EXCERPT_WORDS) out.push({ path, message: `excerpt has ${n} words; the limit is ${MAX_EXCERPT_WORDS}` });
      }
      if (!v || typeof v !== 'object' || Array.isArray(v) || v.verify !== false) return;
      if (!v.verifiedAt) out.push({ path, message: 'verify is false but verifiedAt is empty' });
      const prov = Array.isArray(v.provenance) ? v.provenance : [];
      if (prov.length === 0) out.push({ path, message: 'verify is false but there is no provenance entry' });
      // every provenance object inside a checked record needs its evidence, including status history
      walkJson(v, (p, sub) => {
        if (!isProvenance(p)) return;
        const where = [...path, ...sub];
        if (!p.url) out.push({ path: where, message: 'provenance entry has no url' });
        if (!p.retrievedAt) out.push({ path: where, message: 'provenance entry has no retrievedAt' });
        if (!String(p.excerpt ?? '').trim()) out.push({ path: where, message: 'provenance entry has an empty excerpt' });
      });
    });
    return out;
  },
};

export const proposalsAreNotLaw = {
  id: 'proposals-not-law',
  describe: 'A record whose current status is "proposal" presents no application or entry-into-force date as current.',
  check({ data }) {
    const out = [];
    walkJson(data, (v, path) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return;
      if (currentStatus(v) !== 'proposal') return;
      for (const key of APPLICATION_DATE_KEYS) {
        if (v[key] !== undefined && v[key] !== null && v[key] !== '') {
          out.push({ path: [...path, key], message: `status is "proposal" but ${key} is set; move a proposed date under "proposed"` });
        }
      }
    });
    return out;
  },
};

export const statusHistoryOrder = {
  id: 'status-history',
  describe: 'Status history entries are in date order and the last entry equals the current status.',
  check({ data }) {
    const out = [];
    walkJson(data, (v, path) => {
      if (!v || typeof v !== 'object' || Array.isArray(v) || !Array.isArray(v.statusHistory)) return;
      const h = v.statusHistory;
      for (let i = 1; i < h.length; i++) {
        const a = periodStart(h[i - 1].date);
        const b = periodStart(h[i].date);
        if (a && b && b < a) out.push({ path: [...path, 'statusHistory', i], message: `entry dated ${h[i].date} comes after an entry dated ${h[i - 1].date}` });
      }
      if (typeof v.status === 'string' && h.length && h[h.length - 1].status !== v.status) {
        out.push({ path: [...path, 'status'], message: `status is "${v.status}" but the last history entry says "${h[h.length - 1].status}"` });
      }
      if (typeof v.status === 'string' && h.length === 0) {
        out.push({ path: [...path, 'statusHistory'], message: 'a status is set but the history is empty' });
      }
    });
    return out;
  },
};

export const dates = {
  id: 'dates',
  describe: 'Every dated value is ISO and carries a matching precision, and no event dated in the past is later than the date its source was read.',
  check({ data }, { today }) {
    const out = [];
    walkJson(data, (v, path) => {
      if (!v || typeof v !== 'object' || Array.isArray(v) || !('date' in v)) return;
      const { date, precision } = v;
      if (!('precision' in v)) {
        out.push({ path: [...path, 'date'], message: 'date has no precision field' });
        return;
      }
      if ((date === null) !== (precision === null)) {
        out.push({ path, message: 'date and precision must both be set or both be null' });
        return;
      }
      if (date === null) return;
      if (!ISO[precision] || !ISO[precision].test(date)) {
        out.push({ path: [...path, 'date'], message: `date "${date}" does not match precision "${precision}"` });
        return;
      }
      // An event whose date has passed must have been read on or after that date. If the
      // source was read earlier, it described a scheduled event: re-verify that it happened.
      const start = periodStart(date);
      const provs = Array.isArray(v.provenance) ? v.provenance : isProvenance(v.provenance) ? [v.provenance] : [];
      const read = provs.map((p) => p.retrievedAt).filter(Boolean).sort().pop();
      if (read && start <= today && start > read) {
        out.push({ path: [...path, 'date'], message: `event dated ${date} has passed but its source was read on ${read}, before it happened; re-verify` });
      }
    });
    return out;
  },
};

export const noInternalNotes = {
  id: 'no-internal-notes',
  describe: 'No file under data/lab/ contains the key analyticalNote.',
  check({ data }) {
    const out = [];
    walkJson(data, (v, path) => {
      if (v && typeof v === 'object' && !Array.isArray(v) && 'analyticalNote' in v) {
        out.push({ path: [...path, 'analyticalNote'], message: 'analyticalNote is internal and never enters the lab data' });
      }
    });
    return out;
  },
};

// Visitor-facing fields: label, summary, description, promise, a tool's title, and every
// string under "copy". Verbatim fields and anything inside a provenance entry are exempt.
const VISITOR_KEYS = new Set(['label', 'summary', 'description', 'promise']);

export const style = {
  id: 'style',
  describe: 'Every visitor-facing string passes the house-style scan with zero HARD findings.',
  check({ rel, data }) {
    const out = [];
    const visit = (v, path, key, inCopy, inProv) => {
      if (typeof v === 'string') {
        if (inProv || VERBATIM_KEYS.has(key)) return;
        const checked = inCopy || VISITOR_KEYS.has(key) || (key === 'title' && rel === 'data/lab/tools.json');
        if (!checked) return;
        for (const f of scanString(v)) {
          if (f.level === 'HARD') out.push({ path, message: `house style: ${f.rule} in "${f.excerpt}"` });
        }
        return;
      }
      if (Array.isArray(v)) return v.forEach((x, i) => visit(x, [...path, i], key, inCopy, inProv));
      if (v && typeof v === 'object') {
        const prov = inProv || isProvenance(v);
        for (const [k, x] of Object.entries(v)) visit(x, [...path, k], k, inCopy || k === 'copy', prov);
      }
    };
    visit(data, [], null, false, false);
    return out;
  },
};

export const CORE_RULES = [evidence, proposalsAreNotLaw, statusHistoryOrder, dates, noInternalNotes, style];
