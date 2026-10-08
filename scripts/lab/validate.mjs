#!/usr/bin/env node
// QSC Atlas Labs: validate every lab dataset (npm run lab:validate).
// Checks each file under data/lab/ (except data/lab/watch/) against its schema in
// src/lib/lab/schema.ts, then the shared invariants in scripts/lab/lib/invariants.mjs and
// any tool rules in scripts/lab/invariants/. Exits 1 on any failure, naming the file,
// the record and the rule.

import { validateAll, formatFailure } from './lib/validate-core.mjs';

const { files, failures } = await validateAll();
for (const f of failures) console.log(formatFailure(f));
console.log(`\nlab:validate: ${files} file(s) checked, ${failures.length} failure(s)`);
process.exit(failures.length ? 1 : 0);
