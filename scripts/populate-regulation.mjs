import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { updateCountryProfile } from './lib/notion-write.mjs';
import { fireDeployHook } from './lib/deploy-hook.mjs';

// Populate the regulatory layer (mainRegulation, legalStatus, obligation) for the
// 46 coloured countries not done in the first pass. The 14 non-EU cases are research
// findings (sourced, evidence-anchored); the 24 EU members share the NIS2/DORA
// template; the 8 engaged-unaligned countries carry no instrument (the honest case).
// Writes the canonical profile files and Notion. No analyticalNote is written.
// Run: node scripts/populate-regulation.mjs [--deploy]

loadEnv();
const DS = process.env.NOTION_DB_COUNTRIES;

const EU_REG =
  'NIS2 Directive (EU) 2022/2555, Art. 21(2)(h) | EU | binding-law\n' +
  'DORA, Regulation (EU) 2022/2554 (financial sector) | EU | binding-law\n' +
  'Commission Recommendation (EU) 2024/1101 on a coordinated PQC roadmap | EU | soft-law\n' +
  'NIS Cooperation Group Coordinated Implementation Roadmap (2026/2030/2035) | EU | soft-law';
const EU_OBLIGATION =
  'Essential and important entities must use state-of-the-art cryptography under NIS2, transposed into national law, and financial entities face equivalent duties under DORA; neither yet names post-quantum algorithms specifically. Migration follows the EU coordinated roadmap, with high-risk use cases targeted for 2030 and full migration by 2035, which is encouraged rather than mandated.';
const EU_TAKERS = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'];

const ENGAGED_GENERIC =
  'No binding post-quantum obligation is on record. Engagement to date is limited to awareness or research activity, with no national standard, instrument, or migration timeline adopted.';

const REG = {
  // --- Five Eyes (researched) ---
  GBR: {
    mainRegulation:
      'Network and Information Systems Regulations 2018 | national | binding-law\nCyber Assessment Framework (CAF) | national | binding-by-market-access\nNCSC post-quantum cryptography migration timelines and guidance (to 2035) | national | guidance',
    legalStatus: 'binding',
    obligation:
      'There is no economy-wide post-quantum statute and no binding PQC mandate. The NIS Regulations 2018 place binding cyber security and resilience duties on designated operators of essential services and relevant digital service providers, assessed by sector regulators against the NCSC Cyber Assessment Framework, but these are technology-neutral and do not require post-quantum migration. PQC itself is addressed only through NCSC guidance, which directs migration to the NIST FIPS 203/204/205 algorithms on a phased national timeline to 2035 and carries no legal obligation.',
  },
  CAN: {
    mainRegulation:
      'Treasury Board Security Policy Implementation Notice: Migrating the Government of Canada to Post-Quantum Cryptography (2025) | national | binding-by-market-access\nCanadian Centre for Cyber Security roadmap ITSM.40.001 and guidance ITSAP.00.017 | national | guidance',
    legalStatus: 'binding',
    obligation:
      'Federal departments only: the Treasury Board Security Policy Implementation Notice, effective 9 October 2025 under the Policy on Government Security and the Policy on Service and Digital, requires Government of Canada systems that use cryptography to migrate to post-quantum cryptography, with a high-level migration plan due by April 2026, high-priority systems migrated by the end of 2031 and all remaining systems by 2035. The Cyber Centre roadmap (ITSM.40.001) and quantum-threat guidance (ITSAP.00.017) set the recommended method and align to the NIST standards. There is no economy-wide mandate on private organisations.',
  },
  AUS: {
    mainRegulation:
      'PSPF Policy 11 (Robust ICT systems) applying the Information Security Manual | national | binding-by-market-access\nSecurity of Critical Infrastructure Act 2018 (risk management programme) | national | binding-law\nASD/ACSC post-quantum cryptography guidance | national | guidance',
    legalStatus: 'binding',
    obligation:
      'Non-corporate Commonwealth entities must, under PSPF Policy 11, secure their ICT systems by applying the cyber security principles and risk-based approach of the Australian Government Information Security Manual, which the PSPF makes mandatory under the Public Governance, Performance and Accountability Act 2013; responsible entities for critical infrastructure assets must also maintain a risk management programme addressing cyber and information security hazards under the Security of Critical Infrastructure Act 2018. Neither instrument compels post-quantum migration: PQC is addressed through ASD/ACSC guidance aligned to the NIST algorithms, on an indicative timeline to 2030, with no binding obligation.',
  },
  NZL: {
    mainRegulation:
      'Protective Security Requirements (PSR) mandatory requirements | national | binding-by-market-access\nNew Zealand Information Security Manual (NZISM) post-quantum preparation guidance (Section 2.4) | national | guidance',
    legalStatus: 'binding',
    obligation:
      "Government agencies covered by the Protective Security Requirements (a Cabinet direction binding on public service departments and other mandated agencies, not a statute) must manage information security in line with the PSR's mandatory requirements and report annually on compliance. The post-quantum element is advisory only: NZISM Section 2.4 directs agencies to inventory cryptographically protected assets and plan migration to post-quantum standards referencing the NIST work, and compliance with the NZISM is not required as a matter of law. No obligation falls on the wider economy.",
  },
  // --- Asia-Pacific (researched) ---
  SGP: {
    mainRegulation:
      'CSA Quantum-Safe Handbook and Quantum Readiness Index | national | guidance\nMAS Advisory on Addressing the Cybersecurity Risks Associated with Quantum (MAS/TCRS/2024/01) | national | guidance\nIMDA reference specifications for quantum-safe and QKD networks (draft) | national | guidance',
    legalStatus: 'soft-only',
    obligation:
      'No organisation in Singapore is legally required to adopt post-quantum cryptography. The CSA Quantum-Safe Handbook advises critical information infrastructure owners and government agencies to inventory cryptographic assets and plan migration to the NIST post-quantum baseline, and the MAS advisory makes the same recommendations to financial institutions, but both are advisory only and carry no enforceable obligation.',
  },
  MYS: {
    mainRegulation:
      'Cyber Security Act 2024 (Act 854) | national | binding-law\nCyberSecurity Malaysia / NACSA Post-Quantum Cryptography Migration Framework | national | guidance',
    legalStatus: 'binding',
    obligation:
      'The Cyber Security Act 2024, in force since 26 August 2024, places binding cyber security duties on designated national critical information infrastructure entities, including risk assessment, audit and incident reporting, but it does not mandate post-quantum cryptography specifically. Migration to the NIST post-quantum baseline is set out in the CyberSecurity Malaysia and NACSA Migration Framework, which is technical guidance and is not in itself legally binding.',
  },
  IND: {
    mainRegulation:
      'SEBI Cybersecurity and Cyber Resilience Framework (CSCRF) for Regulated Entities | national | binding-law\nCERT-In Directions of 28 April 2022 under section 70B(6) of the IT Act 2000 | national | binding-law\nCERT-In / MeitY / TEC post-quantum migration roadmap and technical reports | national | guidance',
    legalStatus: 'binding',
    obligation:
      "Entities regulated by SEBI (stock exchanges, depositories, brokers, asset managers and other market intermediaries) must comply with the CSCRF, which is mandatory and includes maintaining a cryptographic-asset inventory and conducting post-quantum risk assessment. Separately, CERT-In's 2022 Directions impose legally binding general cyber security and incident-reporting duties across the economy. The wider move to the NIST post-quantum baseline is set out in the CERT-In, MeitY and TEC roadmap and technical reports, which are guidance rather than binding rules.",
  },
  JPN: {
    mainRegulation:
      'CRYPTREC Ciphers List for e-Government procurement (LS-0001-2022R2) | national | binding-by-market-access\nCommon Standards for Cybersecurity Measures for Government Agencies | national | binding-by-market-access\nCRYPTREC Cryptographic Technology Guideline on Post-Quantum Cryptography (FY2024 edition) | national | guidance\nLiaison Council on the Use of Post-Quantum Cryptography in Government Agencies | national | soft-law',
    legalStatus: 'binding',
    obligation:
      'Government agencies procuring information systems must, under the Common Standards set by the Cybersecurity Strategic Headquarters, specify ciphers from the CRYPTREC Ciphers List in their procurement requirements, which makes the list binding by market access for government suppliers. This currently governs cryptography generally rather than mandating post-quantum algorithms; CRYPTREC has evaluated and is adding the NIST post-quantum algorithms (ML-KEM and others), and its post-quantum guideline remains advisory. There is no general post-quantum obligation on the private sector.',
  },
  // --- Middle East + Brazil (researched) ---
  SAU: {
    mainRegulation:
      'NCA National Cryptographic Standards (NCS-1:2020) | national | binding-law\nNCA consultation adding post-quantum algorithms, RNGs and QKD to the NCS | national | soft-law\nCST Securing Data in the Quantum Computing Era (ICT sector) | national | guidance',
    legalStatus: 'binding',
    obligation:
      "Government entities and critical national infrastructure must meet the National Cybersecurity Authority's minimum cryptographic requirements set in the National Cryptographic Standards (NCS-1:2020), which the NCA is mandated to enforce. The standard already carries a post-quantum cryptography appendix, and the NCA has run a public consultation to add post-quantum algorithms; until that update is finalised, no specific post-quantum algorithm is yet mandated. Communications, Space and Technology Commission material for the ICT sector is advisory only.",
  },
  ARE: {
    mainRegulation:
      'National Encryption Policy and its executive regulation | national | binding-law\nNational Post-Quantum Migration Programme and national Crypto Discovery Tool | national | guidance\nDESC Post-Quantum Cryptography Guideline (Dubai) | national | guidance',
    legalStatus: 'binding',
    obligation:
      'Government entities must hold formally approved plans to migrate from traditional encryption (RSA, ECC and similar) to post-quantum cryptography under the National Encryption Policy and its executive regulation, approved in November 2025, and are expected to maintain an inventory of cryptographic assets and build crypto-agility into new systems. The mandate is a migration obligation overseen by the Cyber Security Council, not the adoption of a national algorithm. The Dubai Electronic Security Center guideline applies within the emirate of Dubai and is advisory.',
  },
  ISR: {
    mainRegulation:
      'Bank of Israel Banking Supervision letter on quantum-era preparedness (7 January 2025) | national | binding-by-market-access\nINCD Organizational Cyber Readiness to the Post-Quantum Age (best practices) | national | guidance',
    legalStatus: 'binding',
    obligation:
      'Supervised banking corporations must assess the suitability of their infrastructure for post-quantum encryption, map their cryptographic inventory and submit an initial preparedness plan with board-level approval to the Banking Supervision Department, within a year of the January 2025 letter. This obligation is confined to the banking sector. Israel National Cyber Directorate material applies economy-wide but is advisory, and no specific post-quantum algorithm is mandated nationally.',
  },
  BRA: {
    mainRegulation:
      'ITI Normative Instruction No. 35/2026 (DOC-ICP-01.01), post-quantum algorithms in ICP-Brasil | national | binding-law\nGSI OSIC 15/2024 emerging-technologies cybersecurity guidance | national | guidance',
    legalStatus: 'binding',
    obligation:
      'Entities operating within the national public-key infrastructure (ICP-Brasil) and the GOV.BR advanced electronic signature must follow the cryptographic standards in ITI Normative Instruction No. 35/2026, which introduces the NIST post-quantum algorithms ML-DSA (FIPS 204) and ML-KEM into the accepted suites. The obligation is scoped to participants in the official PKI rather than the whole economy. Institutional Security Office guidance recommending wider post-quantum migration planning is advisory.',
  },
  // --- Norway + Vietnam (researched) ---
  NOR: {
    mainRegulation:
      'Cryptographic Security Regulation (Forskrift om kryptosikkerhet, 2018, no. 2055) under the National Security Act (sikkerhetsloven) | national | binding-law\nDigital Security Act (Digitalsikkerhetsloven), implementing the NIS Directive (EU) 2016/1148, in force 1 October 2025 | national | binding-law\nNSM quantum migration programme and Cryptographic Recommendations | national | guidance',
    legalStatus: 'binding',
    obligation:
      "Binding law governs Norway's cryptographic and cyber posture: under the Security Act and its Cryptographic Security Regulation, NSM approves the cryptographic systems that protect classified information, and the Digital Security Act imposes cyber-risk duties on essential and digital service providers. Neither instrument mandates post-quantum cryptography specifically; the PQC content sits in NSM's quantum migration programme and Cryptographic Recommendations, which advise organisations to plan and carry out migration to quantum-resistant cryptography but attach no legal obligation. As an EEA state, Norway has adopted the NIS1 framework as national law and tracks NIS2 for future incorporation.",
  },
  VNM: {
    mainRegulation:
      'Law on Cipher 2011 (Law No. 05/2011/QH13) | national | binding-law\nLaw on Cybersecurity 2025 (Law No. 116/2025/QH15), in force 1 July 2026 | national | binding-law\nGovernment Cipher Committee post-quantum research programme and VN-PQSign indigenous signature work | national | guidance',
    legalStatus: 'binding',
    obligation:
      "Binding law governs Vietnam's cryptographic posture: the Law on Cipher 2011 establishes the Government Cipher Committee as the national cryptographic agency, and the Law on Cybersecurity 2025 sets cryptographic protection duties for critical information infrastructure operators from 1 July 2026. Neither instrument mandates post-quantum cryptography specifically. Vietnam's PQC work is indigenous research led by the Government Cipher Committee, including the domestic VN-PQSign signature scheme and proposed national quantum-resistant standards, which remains developmental and advisory rather than a mandated national suite.",
  },
  // --- engaged but unaligned (no instrument on record) ---
  TUR_SKIP: null, // Türkiye already done in the first pass
  UKR: { legalStatus: 'none', obligation: 'No binding post-quantum obligation is on record. Engagement to date is academic and convening activity, with no national standard, instrument, or migration timeline adopted.' },
  DJI: { legalStatus: 'none', obligation: ENGAGED_GENERIC },
  BRN: { legalStatus: 'none', obligation: ENGAGED_GENERIC },
  ARG: { legalStatus: 'none', obligation: ENGAGED_GENERIC },
  CHL: { legalStatus: 'none', obligation: ENGAGED_GENERIC },
  BHR: { legalStatus: 'none', obligation: ENGAGED_GENERIC },
  THA: { legalStatus: 'none', obligation: ENGAGED_GENERIC },
  IDN: { legalStatus: 'none', obligation: 'No binding post-quantum obligation is on record. National agencies have stated an ambition for cryptographic self-reliance and are preparing for migration, but no instrument or adopted standard is yet in place.' },
};
delete REG.TUR_SKIP;
for (const iso of EU_TAKERS) REG[iso] = { mainRegulation: EU_REG, legalStatus: 'binding', obligation: EU_OBLIGATION };

const countries = JSON.parse(readFileSync(join(ROOT, 'data', 'countries.json'), 'utf8'));
const nameOf = (iso) => countries.find((c) => c.iso3 === iso)?.name ?? iso;

async function main() {
  const deploy = process.argv.includes('--deploy');
  let n = 0;
  for (const [iso, entry] of Object.entries(REG)) {
    const fields = { legalStatus: entry.legalStatus, obligation: entry.obligation };
    if (entry.mainRegulation) fields.mainRegulation = entry.mainRegulation;
    await updateCountryProfile(DS, iso, nameOf(iso), fields);

    const fp = join(ROOT, 'data', 'profiles', `${iso}.json`);
    const prof = existsSync(fp) ? JSON.parse(readFileSync(fp, 'utf8')) : { iso3: iso, country: nameOf(iso) };
    if (entry.mainRegulation) prof.mainRegulation = entry.mainRegulation;
    else delete prof.mainRegulation;
    prof.legalStatus = entry.legalStatus;
    prof.obligation = entry.obligation;
    writeFileSync(fp, JSON.stringify(prof, null, 2) + '\n');
    n++;
    console.log(`${iso}: ${entry.legalStatus}${entry.mainRegulation ? '' : ' (no instrument)'}`);
  }
  console.log(`\nPopulated the regulatory layer for ${n} countries.`);
  if (deploy) await fireDeployHook();
}

main().catch((e) => {
  console.error('populate-regulation failed:', e?.message ?? e);
  process.exit(1);
});
