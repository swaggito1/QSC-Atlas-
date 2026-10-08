// QSC Atlas Labs: invariants for the shared lab data (data/lab/shared/).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/common.mjs';

let known;
const atlasCodes = () => (known ??= new Set(JSON.parse(readFileSync(join(ROOT, 'data', 'countries.json'), 'utf8')).map((c) => c.iso3)));

export default [
  {
    id: 'memberships',
    describe: 'Each membership list states its count, lists that many distinct members, and uses ISO3 codes the Atlas knows.',
    appliesTo: (rel) => rel === 'data/lab/shared/memberships.json',
    check({ data }) {
      const out = [];
      (data.lists ?? []).forEach((list, i) => {
        const codes = (list.members ?? []).map((m) => m.iso3);
        if (codes.length !== list.count) out.push({ path: ['lists', i, 'count'], message: `count is ${list.count} but ${codes.length} members are listed` });
        const dupes = codes.filter((c, j) => codes.indexOf(c) !== j);
        if (dupes.length) out.push({ path: ['lists', i, 'members'], message: `listed twice: ${[...new Set(dupes)].join(', ')}` });
        const unknown = codes.filter((c) => !atlasCodes().has(c));
        if (unknown.length) out.push({ path: ['lists', i, 'members'], message: `not in data/countries.json: ${unknown.join(', ')}` });
      });
      return out;
    },
  },
];
