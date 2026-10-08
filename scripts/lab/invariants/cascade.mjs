// QSC Atlas Labs: invariants for the Standards Cascade (prompt 02) and the Standards overview
// (5 October 2026), which read the same files: bodies.json, standards.json and edges.json.
//
// The cross-file rules are pure functions of the three lists (bodyFailures, standardFailures,
// edgeFailures), so scripts/lab/invariants/cascade.test.mjs can test them on fixtures; the rules
// below call them with the repository's files.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/common.mjs';

const CASCADE = 'data/lab/cascade';
const cache = new Map();
/** One of the Cascade's lists, read once from the repository: bodies, standards or edges. */
function list(file, key) {
  if (!cache.has(file)) {
    const path = join(ROOT, CASCADE, file);
    cache.set(file, existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8'))[key] ?? []) : []);
  }
  return cache.get(file);
}
const repoStandards = () => list('standards.json', 'standards');
const repoBodies = () => list('bodies.json', 'bodies');

const synonymsOf = (id, standards = repoStandards()) => standards.find((s) => s.id === id)?.synonyms.map((x) => x.text) ?? [];

// a PDF's text breaks an identifier across lines or table cells ("draft-ietf-ipsecme-hybrid-kem-
// ikev2- ... Frodo"), and documents set case and spacing their own way ("RFC9370", "Hybrid key
// exchange in TLS 1.3"); compared without case, white space and the excerpt's ellipses
const loose = (s) => String(s).toLowerCase().replace(/\.\.\.|…/g, '').replace(/\s+/g, '');

/** True when an excerpt names the standard (or, for "participates", the body), word for word or apart from case, spacing and ellipses. */
export function excerptNamesStandard(edge, standards = repoStandards()) {
  const excerpt = edge.provenance?.[0]?.excerpt ?? '';
  const names = edge.relation === 'participates' ? [edge.to] : synonymsOf(edge.to, standards);
  if (names.some((n) => excerpt.includes(n))) return true;
  const hay = loose(excerpt);
  return names.some((n) => loose(n).length >= 2 && hay.includes(loose(n)));
}

const ISO = { day: /^\d{4}-\d{2}-\d{2}$/, month: /^\d{4}-\d{2}$/, year: /^\d{4}$/ };
const dupes = (ids) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

/** The bodies: unique ids. */
export function bodyFailures(bodies) {
  return dupes(bodies.map((b) => b.id)).map((id) => ({ path: ['bodies'], message: `body id ${id} is used twice` }));
}

/**
 * The standards: unique ids; a body that exists in bodies.json; buildsOn and supersedes that
 * name other standards in standards.json; a status date with a precision it matches; and a
 * national process run by a body of its own country.
 */
export function standardFailures(standards, bodies) {
  const out = [];
  const ids = new Set(standards.map((s) => s.id));
  const byBody = new Map(bodies.map((b) => [b.id, b]));
  for (const id of dupes(standards.map((s) => s.id))) out.push({ path: ['standards'], message: `standard id ${id} is used twice` });
  standards.forEach((s, i) => {
    const at = (key) => ['standards', i, key];
    const body = byBody.get(s.bodyId);
    if (!body) out.push({ path: at('bodyId'), message: `${s.bodyId} is not a body in bodies.json` });
    for (const target of s.buildsOn ?? []) {
      if (target === s.id) out.push({ path: at('buildsOn'), message: `${s.id} cannot build on itself` });
      else if (!ids.has(target)) out.push({ path: at('buildsOn'), message: `${target} is not in standards.json` });
    }
    for (const target of dupes(s.buildsOn ?? [])) out.push({ path: at('buildsOn'), message: `${target} is listed twice` });
    if (s.supersedes != null) {
      if (s.supersedes === s.id) out.push({ path: at('supersedes'), message: `${s.id} cannot supersede itself` });
      else if (!ids.has(s.supersedes)) out.push({ path: at('supersedes'), message: `${s.supersedes} is not in standards.json` });
    }
    const date = s.statusDate ?? null;
    const precision = s.statusPrecision ?? null;
    if ((date === null) !== (precision === null)) out.push({ path: at('statusDate'), message: 'statusDate and statusPrecision must both be set or both be null' });
    else if (date !== null && !(ISO[precision] && ISO[precision].test(date))) out.push({ path: at('statusDate'), message: `statusDate "${date}" does not match precision "${precision}"` });
    if (s.national && body && body.iso3 !== s.national) out.push({ path: at('bodyId'), message: `${s.id} is a national process of ${s.national}, but ${s.bodyId} is not a body of that country` });
  });
  return out;
}

/**
 * The edges: unique ids; every edge points at a standard in standards.json (a "participates"
 * edge at a body in bodies.json); namedAs and namedAsType go together; a verified edge is dated.
 */
export function edgeFailures(edges, standards, bodies) {
  const out = [];
  const standardIds = new Set(standards.map((s) => s.id));
  const bodyIds = new Set(bodies.map((b) => b.id));
  for (const id of dupes(edges.map((e) => e.id))) out.push({ path: ['edges'], message: `edge id ${id} is used twice` });
  edges.forEach((e, i) => {
    const at = (key) => ['edges', i, key];
    if (e.relation === 'participates') {
      if (!bodyIds.has(e.to)) out.push({ path: at('to'), message: `${e.to} is not a body in bodies.json` });
    } else if (!standardIds.has(e.to)) out.push({ path: at('to'), message: `${e.to} is not in standards.json` });
    if (((e.namedAs ?? null) === null) !== ((e.namedAsType ?? null) === null)) out.push({ path: at('namedAs'), message: 'namedAs and namedAsType must both be set or both be null' });
    if (e.verify === false && !e.date) out.push({ path: at('date'), message: 'a verified edge needs the date of its document' });
  });
  return out;
}

export default [
  {
    id: 'edge-excerpt-names-standard',
    describe: "Every edge's first excerpt contains one of its standard's synonyms (apart from case, spacing and ellipses), or for 'participates' the name of the body.",
    appliesTo: (rel) => rel === 'data/lab/cascade/edges.json',
    check({ data }) {
      return (data.edges ?? []).flatMap((e, i) => (excerptNamesStandard(e) ? [] : [{ path: ['edges', i], message: `the excerpt does not name ${e.to} by any of its synonyms` }]));
    },
  },
  {
    id: 'edge-standard-known',
    describe: 'Every edge points at a standard in standards.json (a participates edge at a body in bodies.json); edge ids are unique; namedAs comes with namedAsType; a verified edge is dated.',
    appliesTo: (rel) => rel === 'data/lab/cascade/edges.json',
    check({ data }) {
      return edgeFailures(data.edges ?? [], repoStandards(), repoBodies());
    },
  },
  {
    id: 'standard-links-known',
    describe: 'Every standard names a body in bodies.json, builds on and supersedes only standards in standards.json, and dates its status at a matching precision.',
    appliesTo: (rel) => rel === 'data/lab/cascade/standards.json',
    check({ data }) {
      return standardFailures(data.standards ?? [], repoBodies());
    },
  },
  {
    id: 'body-ids-unique',
    describe: 'Every body in bodies.json has its own id.',
    appliesTo: (rel) => rel === 'data/lab/cascade/bodies.json',
    check({ data }) {
      return bodyFailures(data.bodies ?? []);
    },
  },
];
