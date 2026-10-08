# Standards Cascade data

Filled by `labs/prompts/02-standards-cascade.md`. Register each file in `DATASETS` in `src/lib/lab/schema.ts`.

Since 5 October 2026 the same files feed the Standards overview (`/standards`): `bodies.json` names the bodies it groups by, and a record with `cascade: false` belongs to the overview only, so the Cascade never reads it.
