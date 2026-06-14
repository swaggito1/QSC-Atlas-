import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { updateCountryProfile } from './lib/notion-write.mjs';
import { fireDeployHook } from './lib/deploy-hook.mjs';

// Apply the two-field classification model (docs/CLASSIFICATION_MODEL.md, decided
// 2026-06-14) to every coloured country: coordinationPosture (the map colour) and
// standardsRole (the badge), with a confidence grade. Writes the canonical profile
// files and Notion. Legacy dominantProcess/secondaryProcess are left in place during
// migration. Verdicts are from docs/CLASSIFICATION_VERIFICATION_MEMO.md sections 5-6.
// Run: node scripts/apply-model.mjs [--deploy]

loadEnv();
const DS = process.env.NOTION_DB_COUNTRIES;

// [posture, role|null, confidence, note]
const MODEL = {
  // --- EU coordinated roadmap ---
  FRA: ['EU', 'contextualiser', 'High', 'ANSSI mandates hybridisation and national certification over NIST algorithms; no national algorithm. Sovereign secondary dropped.'],
  DEU: ['EU', 'contextualiser', 'High', 'BSI TR-02102 over NIST algorithms; FrodoKEM is a non-national design, not a German scheme. Mixed secondary dropped.'],
  EUU: ['EU', 'contextualiser', 'Medium', 'Supranational coordinator/conditioner: produces regulation and the coordinated roadmap, no algorithm of its own.'],
  // --- NIST-led ecosystem ---
  USA: ['NIST-bloc', 'setter', 'High', 'The standard-setter: writes the FIPS suite the world adopts; CNSA 2.0.'],
  GBR: ['NIST-bloc', 'taker', 'High', 'NCSC migration to 2035 aligned to FIPS 203/204/205.'],
  CAN: ['NIST-bloc', 'taker', 'High', 'Long-standing adopter; CSE guidance and Treasury Board SPIN migration mandate.'],
  AUS: ['NIST-bloc', 'taker', 'Medium', 'ASD guidance aligned to the NIST suite; Five Eyes posture.'],
  NZL: ['NIST-bloc', 'taker', 'Medium', 'NZ guidance aligned to the NIST suite; Five Eyes posture.'],
  SGP: ['NIST-bloc', 'contextualiser', 'Medium', 'CSA Quantum-Safe Handbook and MAS guidance reference the NIST process; contextualiser-leaning.'],
  MYS: ['NIST-bloc', 'taker', 'High', 'Migration framework follows NIST; MyKriptografi/MySEAL are national programmes, not a sovereign algorithm.'],
  IND: ['NIST-bloc', 'contextualiser', 'Medium', 'DST/MeitY/CERT-In anchor validation on NIST CAVP; national certification overlay, not a national algorithm.'],
  ISR: ['NIST-bloc', 'taker', 'Medium', 'INCD readiness guidance and Bank of Israel letter point to the standardised NIST algorithms.'],
  BRA: ['NIST-bloc', 'taker', 'Medium', 'ITI Normative Instruction 35/2026 folds PQC into ICP-Brasil (NIST adoption); confirm candidate sources to firm up.'],
  NOR: ['NIST-bloc', 'taker', 'Low', 'NSM runs a migration programme; explicit NIST PQC adoption is inferred, not attested. Thin.'],
  SAU: ['NIST-bloc', 'taker', 'Medium', 'NCS-1:2020 is a national standard profiling NIST best practices, not a sovereign algorithm. Reclassified from Sovereign.'],
  ARE: ['NIST-bloc', 'taker', 'Medium', 'National Encryption Policy is a migration mandate over standardised algorithms, not an algorithm of its own. Reclassified from Sovereign.'],
  JPN: ['NIST-bloc', 'contextualiser', 'Medium', 'CRYPTREC evaluates and lists the NIST algorithms; no national algorithm. Reclassified from Mixed.'],
  KOR: ['NIST-bloc', 'contextualiser', 'Medium', 'Runs the KpqC national competition but keeps algorithms NIST-interoperable; on the sovereign boundary. Reclassified from Mixed.'],
  // --- sovereign bloc ---
  CHN: ['sovereign-bloc', 'sovereign-developer', 'High', 'SM-series mandated under the 2020 Cryptography Law; NGCC programme (Feb 2025) building sovereign PQC independent of NIST.'],
  RUS: ['sovereign-bloc', 'sovereign-developer', 'High', 'GOST suite under TC26 (FSB); indigenous PQC candidates (Shipovnik, Hypericum, Codiaeum).'],
  VNM: ['sovereign-bloc', 'sovereign-developer', 'Low', 'VN-PQSign is a genuine indigenous effort but at research/announcement stage, not a mandated national suite. Emerging.'],
  // --- engaged but unaligned (no declared role) ---
  TUR: ['engaged-unaligned', null, 'Low', 'Source names no standards camp, FIPS suite or national scheme. Engaged but uncommitted.'],
  UKR: ['engaged-unaligned', null, 'Low', 'Only a conference call-for-papers; no standard named. Engaged but uncommitted.'],
  DJI: ['engaged-unaligned', null, 'Low', 'Minimal evidence; no national adoption found. Engaged but uncommitted.'],
  BRN: ['engaged-unaligned', null, 'Low', 'Minimal evidence; no national adoption found. Engaged but uncommitted.'],
  ARG: ['engaged-unaligned', null, 'Medium', 'De-facto NIST default on thin attestation; no sourced national adoption. Engaged but uncommitted pending evidence.'],
  CHL: ['engaged-unaligned', null, 'Medium', 'De-facto NIST default on thin attestation; no sourced national adoption. Engaged but uncommitted pending evidence.'],
  BHR: ['engaged-unaligned', null, 'Medium', 'De-facto NIST default on thin attestation; no sourced national adoption. Engaged but uncommitted pending evidence.'],
  THA: ['engaged-unaligned', null, 'Medium', 'De-facto NIST default on thin attestation; no sourced national adoption. Engaged but uncommitted pending evidence.'],
  IDN: ['engaged-unaligned', null, 'Medium', 'BSN-BSSN cooperation to prepare for migration with a cryptographic-independence ambition, but no concrete algorithm and no firm NIST adoption. Sovereign intent noted.'],
};
// The 25 plain EU members: EU coordination, taker role, NIST algorithms underneath.
const EU_TAKERS = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'];
for (const iso of EU_TAKERS)
  if (!MODEL[iso]) MODEL[iso] = ['EU', 'taker', 'High', 'EU coordinated roadmap (NIS Cooperation Group); adopts the NIST baseline as a taker. No national algorithm.'];

const countries = JSON.parse(readFileSync(join(ROOT, 'data', 'countries.json'), 'utf8'));
const nameOf = (iso) => countries.find((c) => c.iso3 === iso)?.name ?? iso;

async function main() {
  const deploy = process.argv.includes('--deploy');
  let n = 0;
  for (const [iso, [posture, role, confidence, note]] of Object.entries(MODEL)) {
    const fields = { coordinationPosture: posture, confidence };
    if (role) fields.standardsRole = role;
    await updateCountryProfile(DS, iso, nameOf(iso), fields);

    const fp = join(ROOT, 'data', 'profiles', `${iso}.json`);
    const prof = existsSync(fp) ? JSON.parse(readFileSync(fp, 'utf8')) : { iso3: iso, country: nameOf(iso) };
    prof.coordinationPosture = posture;
    if (role) prof.standardsRole = role;
    else delete prof.standardsRole;
    prof.confidence = confidence;
    prof.provenance = [
      ...(prof.provenance || []).filter((x) => !/^Model 2026-06-14/.test(x)),
      `Model 2026-06-14 (${posture}${role ? ` / ${role}` : ''}, ${confidence}): ${note}`,
    ];
    writeFileSync(fp, JSON.stringify(prof, null, 2) + '\n');
    n++;
    console.log(`${iso}: ${posture}${role ? ` / ${role}` : ''} (${confidence})`);
  }
  console.log(`\nApplied the two-field model to ${n} countries.`);
  if (deploy) await fireDeployHook();
}

main().catch((e) => {
  console.error('apply-model failed:', e?.message ?? e);
  process.exit(1);
});
