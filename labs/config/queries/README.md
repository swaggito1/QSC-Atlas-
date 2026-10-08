# SPARQL queries for the watch pipeline

Prompt 00 writes and tests these against the CELLAR endpoint (`http://publications.europa.eu/webapi/rdf/sparql`) before enabling the entries that use them. Use the query patterns in the `eurlex` R package (`elx_make_query` and its documentation) as known-good references for CDM property names, and check every property against the CDM ontology before relying on it. Each query returns a flat table that `scripts/lab/watch.mjs` sorts and hashes, so a change in any row is detected.

## `base-acts-amendments.rq`

For each watched base act (CELEX 32022L2555, 32022L2557, 32022R2554, 32024R2847, 32024R1689, 32016R0679, 32019D0797, 32024H1101), return every legal resource that amends it, corrects it (corrigenda), consolidates it, or is based on it (implementing and delegated acts), with that resource's CELEX number, document date, date of entry into force where recorded, resource type and English title. Sort by base act, then date, then CELEX.

## `proposal-procedures.rq` (optional, once procedure numbers are resolved)

For the interinstitutional procedures behind COM(2026) 13, the Cybersecurity Act revision proposal and the Digital Omnibus, return procedure events known to CELLAR with dates. If CELLAR does not hold procedure stages in usable form, keep the Legislative Observatory page as the watched source instead and say so in the prompt 00 report.
