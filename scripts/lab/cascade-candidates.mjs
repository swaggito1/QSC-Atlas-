#!/usr/bin/env node
// QSC Atlas Labs: candidate edges for the Standards Cascade.
// Scans the included documents in data/results/*.json for any synonym in
// data/lab/cascade/standards.json, in the title or the summary, case-insensitively and on
// word boundaries (synonyms of four characters or fewer, such as LMS or HQC, must match
// case exactly). Writes data/lab/cascade/candidates.json. Candidates are leads for the edge
// verification step and are never shown on the page: the summary was written by a
// classifier, so a match there proves nothing on its own.
// Usage: node scripts/lab/cascade-candidates.mjs [--out data/lab/cascade/candidates.json]

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain } from './lib/common.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function synonymPatterns(standards) {
  return standards.flatMap((s) =>
    s.synonyms.map((syn) => ({
      standardId: s.id,
      text: syn.text,
      re: new RegExp(`(?<![A-Za-z0-9])${esc(syn.text)}(?![A-Za-z0-9])`, syn.text.replace(/[^A-Za-z]/g, '').length <= 4 ? '' : 'i'),
    })),
  );
}

export function findCandidates({ root = ROOT, standards } = {}) {
  if (!standards && !existsSync(join(root, 'data/lab/cascade/standards.json'))) return [];
  standards ??= JSON.parse(readFileSync(join(root, 'data/lab/cascade/standards.json'), 'utf8')).standards;
  const patterns = synonymPatterns(standards);
  const out = [];
  const seen = new Set();
  const dir = join(root, 'data', 'results');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const iso3 = f.replace(/\.json$/, '');
    for (const doc of JSON.parse(readFileSync(join(dir, f), 'utf8'))) {
      if (doc.included !== true || !doc.url) continue;
      for (const field of ['title', 'summary']) {
        const text = doc[field] ?? '';
        for (const p of patterns) {
          if (!p.re.test(text)) continue;
          const key = `${doc.url}|${p.standardId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ docUrl: doc.url, docTitle: doc.title, issuingOrg: doc.issuingOrg ?? null, iso3, year: doc.year ?? null, matchedSynonym: p.text, standardId: p.standardId, field });
        }
      }
    }
  }
  return out.sort((a, b) => a.iso3.localeCompare(b.iso3) || (a.year ?? 0) - (b.year ?? 0) || a.docUrl.localeCompare(b.docUrl) || a.standardId.localeCompare(b.standardId));
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = i >= 0 ? process.argv[i + 1] : 'data/lab/cascade/candidates.json';
  const candidates = findCandidates();
  const file = {
    _about: 'Candidate edges found by scripts/lab/cascade-candidates.mjs. Leads only: never rendered. An edge becomes real only when its document has been read and the sentence naming the standard quoted in edges.json.',
    generatedAt: new Date().toISOString().slice(0, 10),
    candidates,
  };
  writeFileSync(join(ROOT, out), JSON.stringify(file, null, 2) + '\n');
  const byCountry = {};
  for (const c of candidates) byCountry[c.iso3] = (byCountry[c.iso3] ?? 0) + 1;
  console.log(`${candidates.length} candidate(s) in ${Object.keys(byCountry).length} jurisdiction(s) written to ${out}`);
  console.log(Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
}
