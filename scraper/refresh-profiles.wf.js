export const meta = {
  name: 'qsc-atlas-refresh-profiles',
  description: 'Refresh analytical profiles for countries whose corpus gained material new documents (mise en forme delta)',
  phases: [{ title: 'Refresh profiles' }],
}

const ROOT = '/Users/swannashworth/qsc-atlas'

const SCHEMA = {
  type: 'object',
  required: ['iso3', 'changedFields', 'couldNotAttest', 'profile'],
  properties: {
    iso3: { type: 'string' },
    changedFields: { type: 'array', items: { type: 'string' }, description: 'which profile fields you changed vs the existing profile' },
    couldNotAttest: { type: 'string', description: 'fields a new development implies but you could NOT attest to a document (left unchanged), or "none"' },
    dominantProcessProposedChange: { type: 'string', description: 'if a new doc seems to shift the map-colour alignment, describe it here for human review; you must NOT change dominantProcess yourself unless a document unambiguously states the new alignment. "none" if no change.' },
    profile: {
      type: 'object',
      description: 'the FULL updated profile to write (include unchanged fields too, drawn from the existing profile); omit a field only if it is genuinely unattested',
      required: ['iso3', 'dataStatus'],
      properties: {
        iso3: { type: 'string' },
        summary: { type: 'string' },
        dominantProcess: { type: 'string', enum: ['NIST', 'EU', 'ETSI', 'ISO', 'Sovereign', 'Mixed'] },
        standardFamilies: { type: 'string' },
        algorithms: { type: 'string' },
        processParticipation: { type: 'string' },
        hybridDeployment: { type: 'string', enum: ['Required', 'Recommended', 'Under evaluation', 'Discouraged', 'None stated'] },
        migrationTimeline: { type: 'string', description: 'one "YYYY | milestone" per line' },
        targetCompletion: { type: 'string', enum: ['2030', '2035', 'Phased (no fixed end)', 'None stated'] },
        legalStatus: { type: 'string', enum: ['binding', 'soft-only', 'none'] },
        mainRegulation: { type: 'string', description: 'one "instrument | level | status" per line; status in binding-law/binding-by-market-access/soft-law/guidance' },
        govActors: { type: 'string', description: 'one "name | role" per line; use issuingOrg names from the documents' },
        dataStatus: { type: 'string', enum: ['Complete', 'Partial', 'Placeholder'] },
      },
    },
  },
}

const prompt = (c) => `You are refreshing the QSC Atlas ANALYTICAL PROFILE for ${c.name} (${c.iso3}) because new institutional PQC documents were just added to its corpus. This is the "mise en forme" delta.

Read, in order:
1. ${ROOT}/scraper/PROFILE_GUIDE.md  - the binding rules (THE IRON RULE: every field value must be attested by an ingested document for this country; never fill from general knowledge; omit what you cannot attest; profiles stay dataStatus "Partial").
2. ${ROOT}/data/profiles/${c.iso3}.json  - the EXISTING profile (your starting point; may not exist - then build fresh).
3. ${ROOT}/data/results/${c.iso3}.json  - the FULL current corpus INCLUDING the newly added documents (these are the source of any change).

Task: produce the FULL updated profile object reflecting what the NEW documents now attest. Typical updates this round: firmer migrationTimeline milestones and a targetCompletion now that deadlines are set; new govActors (e.g. a financial regulator or standards body that newly appears in the corpus); a mainRegulation / legalStatus when a binding instrument (law, executive order, directive) now exists; a refreshed summary. Carry forward unchanged fields from the existing profile so the written profile is complete.

STRICT GUARDRAILS:
- Attest every value to a specific document in the results file. If a development is only a "watch item" (announced but no document captured), do NOT encode it as a field value; mention it in couldNotAttest.
- dominantProcess COLOURS THE MAP. Do NOT change it unless a new document UNAMBIGUOUSLY states a new standards alignment. If you think it may have shifted, leave it as-is and describe the case in dominantProcessProposedChange for human review. NOTE FOR THIS RUN: dominantProcess is currently ABSENT for these countries, so they render grey despite holding documents. You MAY set it, but ONLY if the ingested documents unambiguously attest a standards alignment (for example the national guidance adopts the NIST FIPS suite by name). If the evidence is mixed, partial or inferred, leave it absent and explain in dominantProcessProposedChange - a grey country is correct where the evidence does not support a colour.
- Field formats: migrationTimeline lines "YYYY | milestone"; govActors lines "name | role"; mainRegulation lines "instrument | level | status" (status in binding-law / binding-by-market-access / soft-law / guidance); processParticipation lines "process | role". Selects must match the allowed values exactly (see PROFILE_GUIDE and the schema). British English, no em-dashes or en-dashes in summary.
- dataStatus = "Partial".

Return: iso3, the full profile object, changedFields (list), couldNotAttest (string), and dominantProcessProposedChange (string).`

const COUNTRIES = [
  { iso3: 'CHE', name: 'Switzerland' }, { iso3: 'NATO', name: 'NATO' },
  { iso3: 'GUY', name: 'Guyana' }, { iso3: 'URY', name: 'Uruguay' },
]

phase('Refresh profiles')
log('Refreshing ' + COUNTRIES.length + ' profiles: ' + COUNTRIES.map((c) => c.iso3).join(' '))
const res = await parallel(
  COUNTRIES.map((c) => () =>
    agent(prompt(c), { label: `profile:${c.iso3}`, phase: 'Refresh profiles', schema: SCHEMA, agentType: 'general-purpose' })
      .then((r) => r ?? { iso3: c.iso3, changedFields: [], couldNotAttest: 'agent returned null - re-run', dominantProcessProposedChange: 'none', profile: null }),
  ),
)
return res.filter(Boolean)
