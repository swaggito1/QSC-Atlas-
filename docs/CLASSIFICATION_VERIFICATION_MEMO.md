# QSC Atlas: classification verification memo

Companion to `METHODOLOGY_ISSUE.md` (the problem statement) and `REVIEWER_GUIDE.md`
(the review procedure). This memo carries out the review the other two set up: it
verifies the camp label of every coloured country against the documented QSC reality
and the thesis framework, and records, per country, whether the label holds.

It does not change any data. Every reclassification below is a recommendation, marked
provisional, for the researcher to confirm, amend, or reject. The verdicts apply the
project's own rubric; they are not an external opinion about what the camps should be.

Sources for the factual claims are listed at the end.

---

## 1. Method

Each coloured country was tested against the fixed rubric proposed in
`METHODOLOGY_ISSUE.md`, in its decision order, and cross-read against the thesis
standards typology (standard-setter, standard-contextualiser, standard-taker) carried
in the Fable 5 handover and Chapter 6. The evidence base was: the country profiles
(`data/profiles/*.json`) and their recorded classification basis; the Fable 5 country
briefs; the non-Western standards note; and targeted verification of present-day facts
against official and reputable sources for the contestable cases.

The single test that does most of the work is the Sovereign test, because it is first
in the decision order and because it is where most of the misattribution sits:

> Does the state develop or mandate its **own national PQC algorithm**, as opposed to a
> national **programme, policy, standard, or research effort** that adopts the
> internationally standardised (NIST) algorithms?

A national encryption policy, a migration mandate, a national cryptographic standard
that profiles NIST, or a research laboratory are not sovereign algorithms. Conflating
the two is the single most common error in the current data.

---

## 2. QSC primer: the facts every verdict rests on

These are the ground truths against which the labels are judged.

**There is one global algorithmic baseline, and it is NIST's.** FIPS 203 (ML-KEM, from
CRYSTALS-Kyber), FIPS 204 (ML-DSA, from CRYSTALS-Dilithium) and FIPS 205 (SLH-DSA, from
SPHINCS+) were finalised on 14 August 2024. FIPS 206 (FN-DSA, from Falcon) is in draft,
with a final expected around 2026 to 2027. Almost every state that has chosen anything
has chosen these.

**The EU has no PQC algorithm of its own.** The Union produces the regulatory
architecture (NIS2 Article 21(2)(h), DORA), the soft law (Commission Recommendation
(EU) 2024/1101), and the coordinated timeline (NIS Cooperation Group Coordinated
Implementation Roadmap v1.1, 11 June 2025; milestones 2026, 2030, 2035), with ENISA
support. It does not standardise competing algorithms. ETSI produces migration and
hybrid-deployment frameworks, not a rival algorithm suite. This is why the Atlas's ETSI
and ISO camps have no members, and it is the crux of section 3.

**Only a few states run a genuine parallel algorithm ecosystem.** China mandates the
SM-series (SM2, SM3, SM4, SM9) under the 2020 Cryptography Law and, in February 2025,
launched the NGCC programme through the ICCS to produce sovereign PQC standards
independent of NIST. Russia maintains the GOST suite under TC26 (FSB) and is developing
indigenous PQC candidates (Shipovnik, Hypericum, Codiaeum). South Korea selected its
own KpqC algorithms on 16 January 2025 (KEMs NTRU+ and SMAUG-T; signatures AIMer and
HAETAE), although these are technically cognate with the NIST selections.

**The thesis already has the right vocabulary.** The standard-setter (the United States,
through NIST) produces the baseline; standard-contextualisers (France, Germany, and in
the handover's own words South Korea) adopt that baseline and add national requirements
such as mandatory hybridisation, larger keys, or independent certification;
standard-takers adopt it as is. Sovereign developers (China, Russia) build a parallel
suite. This three-way-plus-sovereign distinction is finer and more defensible than the
Atlas's NIST / EU / Sovereign / Mixed camps, and most of the corrections below are
really a request to let the data speak in that vocabulary.

---

## 3. The core diagnosis, confirmed

`METHODOLOGY_ISSUE.md` records that four different rules produced the camp variable. The
verification confirms that, and isolates why the result feels wrong for EU countries
specifically.

**The "Dominant Standards Process" variable collapses two different axes onto one
colour.** "EU" answers the question *which coordination bloc does the state belong to*.
"NIST" and "Sovereign" answer a different question, *whose algorithms does the state
use*. These are not the same axis, so a country cannot be placed on both at once without
losing information.

Run an EU member state through both axes and the problem is plain. On the coordination
axis it is EU: it sits in the NIS Cooperation Group roadmap. On the algorithm axis it is
NIST: it deploys ML-KEM and ML-DSA, because no EU-origin alternative exists. The Atlas
shows only the first and hides the second. That is exactly the observation that prompted
this review: EU countries read as a distinct bloc, but underneath they are NIST adopters
with an EU regulatory wrapper. The wrapper is real and worth recording; it is not a
different set of standards.

**The same collapse produces identical postures wearing different labels.** France,
Germany and Japan all do the same thing: accept NIST algorithms and add a national
doctrine (ANSSI hybridisation; BSI TR-02102; CRYPTREC evaluation and listing). In the
data they wear three different labels:

| Country | Same underlying posture | Atlas label | Why the label differs |
|---|---|---|---|
| France | NIST algorithms + national doctrine | EU + **Sovereign** | EU by membership rule; "Sovereign" misread from ANSSI's national doctrine |
| Germany | NIST algorithms + national doctrine | EU + **Mixed** | EU by membership rule; "Mixed" from BSI TR + FrodoKEM |
| Japan | NIST algorithms + national doctrine | **Mixed** | no EU membership, so the national-doctrine reading surfaced as the primary camp |

All three are standard-contextualisers. The label divergence is an artefact of which
rule fired and whether the country happened to be in the EU, not of any real difference
in their cryptography.

**A second, sharper inconsistency: the Sovereign label runs backwards.** France carries
a Sovereign secondary and has no national algorithm. South Korea carries only Mixed and
has four national algorithms (the KpqC selections). The country with genuine algorithmic
independence is labelled more weakly than the country without it.

---

## 4. The fix: Option A (adopted)

**Decision (14 June 2026): adopt the two-field model.** Record the two axes separately
and stop forcing them onto one colour. The single-camp alternative (Option B, retained
at the end of this section for the record) is not adopted.

Two fields replace the one "Dominant Standards Process" camp:

- *Coordination posture*: which collective transition a country belongs to.
  Values: `EU` / `NIST-bloc` / `sovereign-bloc` / `engaged-unaligned`.
- *Standards role*: a country's relationship to the algorithms themselves.
  Values: `setter` / `contextualiser` / `taker` / `sovereign-developer`.

The map can colour by either. Coloured by coordination posture, the EU "bloc" finally
says what it means: a coordination bloc, not a standards bloc. France becomes EU
coordination, contextualiser role. The United States becomes NIST-bloc, setter role,
which the present data cannot express. China becomes sovereign-bloc, sovereign-developer.

### Implementation specification

Public-facing copy explaining each value is in `docs/CLASSIFICATION_MODEL.md`.

Data (`data/profiles/*.json`), two new fields, with the legacy `dominantProcess` and
`secondaryProcess` retained during migration so nothing breaks:

- `coordinationPosture`: one of `EU`, `NIST-bloc`, `sovereign-bloc`, `engaged-unaligned`.
- `standardsRole`: one of `setter`, `contextualiser`, `taker`, `sovereign-developer`.

Code:

- `src/lib/process.ts`: add the two enums and their plain-language labels and colours.
  Suggested posture colours reuse the current palette: EU `#5b54a8`, NIST-bloc `#2b4c7e`,
  sovereign-bloc `#7a3b5e`, engaged-unaligned `#6b7280`; no-data stays `#e7e5df`.
  Standards role is shown as a labelled badge, not a colour.
- `src/components/ProcessLegend.astro`: legend keys by coordination posture; add a role
  badge legend.
- `src/components/ProfilePanel.astro` / `ProcessChip.astro`: show both fields, posture
  first, role as a badge.
- Map default colours by coordination posture; offer a toggle to recolour by standards
  role.

Migration mechanics: a one-pass script over `data/profiles/*.json` derives the two new
fields from the verdicts in sections 5 and 6, writes provenance, then
`node scripts/update-profile.mjs data/profiles/*.json --deploy`. `confidence` and
`verificationStatus` should drive map opacity so soft calls look soft. The
`engaged-unaligned` posture must exist: defaulting those countries to NIST is what
inflates NIST's apparent reach (section 5.4).

### Option B (not adopted, retained for the record)

One camp with a disciplined rubric: apply the `METHODOLOGY_ISSUE.md` rubric strictly and
in order (Sovereign tested first on the algorithm test above; then EU by membership; then
NIST by attestation; Mixed only where a real national scheme coexists with NIST; a
genuine grey state for engaged-but-uncommitted), and add a structured `standardsRole`
field alongside so the setter / contextualiser / taker information is not lost. Rejected
because it keeps the axis collapse in the headline colour, which is the root problem.

---

## 5. Per-country verification

Verdict key: **Holds** (label supported); **Overstated** (some basis, but the label
claims more than the evidence); **Misattributed** (label not supported, reclassification
recommended); **Structural** (label technically defensible but hides a distinction the
map should show).

### 5.1 The EU bloc (27 states)

The EU-aligned label **holds as a coordination posture** for all 27 members: membership
plus participation in the NIS Cooperation Group roadmap is a fact, and the 2030 / 2035
timeline shown is the EU coordinated one (the profiles say so in their provenance). The
correct reading, for every one of them, is *EU coordination, NIST algorithms
underneath, contextualiser or taker role*. The colour is not wrong; it is half the
picture. The errors are in the two secondary labels.

| Country | Atlas label | Verdict | Recommendation (provisional) |
|---|---|---|---|
| France | EU + Sovereign | **Misattributed** (secondary) | Drop "Sovereign". France mandates hybridisation and national certification over **NIST** algorithms; it has no national algorithm. Role: contextualiser. The handover names France a contextualiser explicitly. |
| Germany | EU + Mixed | **Overstated** (secondary) | "Mixed" rests on BSI TR-02102 plus secunet's use of FrodoKEM. FrodoKEM is a non-NIST international design, not a German national algorithm, so this is contextualiser behaviour, not a national scheme. Soften to contextualiser; drop or footnote "Mixed". |
| Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden (25) | EU | **Holds** (coordination); **Structural** (algorithm axis hidden) | Keep EU coordination. Add role: taker (or contextualiser where a national profile exists, e.g. the Netherlands' NCSC TLS guidance and migration handbook). None has a national algorithm. |

### 5.2 The Sovereign group (5 states)

This is where the non-EU misattribution concentrates. Only two of the five pass the
algorithm test.

| Country | Atlas label | Verdict | Evidence and recommendation (provisional) |
|---|---|---|---|
| China | Sovereign | **Holds** | SM-series mandated under the 2020 Cryptography Law; NGCC programme (Feb 2025) building sovereign PQC standards explicitly independent of NIST. Strongest case in the dataset. Raise confidence Medium to High. |
| Russia | Sovereign | **Holds** | GOST suite under TC26 (FSB); indigenous PQC candidates Shipovnik, Hypericum, Codiaeum. Raise confidence Medium to High. |
| Vietnam | Sovereign | **Overstated** | VN-PQSign (hash-based signature) is a genuine indigenous effort with a self-reliance framing, but it is one scheme at research and announcement stage, not a mandated national suite; the profile itself says Vietnam is building research capacity "rather than publishing an adopted national standard". Keep a sovereign **lean** but mark emerging and low confidence, or treat as engaged-with-sovereign-intent. |
| Saudi Arabia | Sovereign | **Misattributed** | The NCA's National Cryptographic Standards (NCS-1:2020) are, in their own words, "based on global best practices and global standards"; the PQC appendix was written before the NIST finals and anticipates adopting international standards. This is a national standard that profiles NIST, not a sovereign algorithm. Recommend NIST-aligned, contextualiser role. |
| UAE | Sovereign | **Misattributed** | The National Encryption Policy and executive regulation impose a migration **mandate**, and the National PQC Migration Programme plus the Crypto Discovery Tool are discovery and transition instruments. Reporting groups the UAE with the US NSM-10 and Canada's SPIN as a binding-mandate country, not an algorithm developer. Recommend NIST-aligned with a strong national mandate; contextualiser role. |

### 5.3 The Mixed group (4 entries)

| Entry | Atlas label | Verdict | Evidence and recommendation (provisional) |
|---|---|---|---|
| South Korea | Mixed | **Holds** (most defensible Mixed) | Genuinely runs its own KpqC selections (NTRU+, SMAUG-T, AIMer, HAETAE, Jan 2025) under KCMVP, cognate with but independent of NIST. The handover calls this a contextualiser running a parallel competition. Keep, and note it has a stronger sovereign claim than France's secondary. |
| Japan | Mixed | **Overstated** | CRYPTREC evaluates and lists the NIST algorithms (ML-KEM included in the Ciphers List; PQC Guideline 2024 edition); the NCO targets 2035 with a roadmap due 2027. No Japanese national algorithm. This is the France/Germany posture; "Mixed" overstates independence. Recommend NIST-aligned, contextualiser role. |
| Indonesia | Mixed | **Overstated** | The basis is BSN-BSSN cooperation to "prepare" for migration and a stated ambition of "national cryptography independence", with no concrete PQC algorithm and no firm NIST adoption yet. Recommend engaged-but-uncommitted (grey) with a sovereign-intent note; revisit when a scheme or an adoption is published. |
| European Union (supranational) | Mixed | **Misattributed** | The EU has no algorithm; its instruments are regulatory (Recommendation 2024/1101, the roadmap, ENISA studies) and ETSI's outputs are migration and hybrid frameworks. "Mixed" implies a national scheme plus NIST, which does not fit. Recommend a supranational conditioner / contextualiser label, distinct from the member-state colour. |

### 5.4 The NIST group (19 states)

Three sub-groups: the setter, the clean takers, and the soft de-facto defaults.

**The setter, mislabelled as a follower.**

| Country | Atlas label | Verdict | Recommendation (provisional) |
|---|---|---|---|
| United States | NIST | **Structural** | Correct that it is in the NIST orbit, but it *is* NIST: the setter, through the FIPS process and CNSA 2.0. Colouring it the same as adopters erases the setter/taker distinction that the thesis turns on. Add role: setter. Raise confidence to High. |

**Clean takers and adopters (label holds).**

| Country | Atlas label | Verdict | Note |
|---|---|---|---|
| United Kingdom | NIST | **Holds** | NCSC migration to 2035, aligned to FIPS 203/204/205. High confidence is right. (Excluded from the thesis corpus per the C0 constraint, but coloured here.) |
| Canada | NIST | **Holds** | Long-standing adopter (CSE; Treasury Board SPIN migration mandate). |
| Australia, New Zealand | NIST | **Holds** (medium) | ASD / NZ guidance aligns with the NIST suite; Five Eyes posture. |
| Singapore | NIST | **Holds** (medium) | CSA Quantum-Safe Handbook and MAS guidance reference the NIST process; contextualiser-leaning. |
| Malaysia | NIST | **Holds** | Migration framework follows NIST; MyKriptografi/MySEAL are national programmes, not a sovereign PQC algorithm (the profile's own review note confirms this). |
| India | NIST | **Holds** (contextualiser-leaning) | DST quantum-safe ecosystem report (Feb 2026) and the MeitY/CERT-In roadmap anchor algorithm validation on NIST's CAVP; India is building a national certification overlay, not a national algorithm. |
| Israel | NIST | **Holds** (medium) | INCD readiness guidance and the Bank of Israel banking-supervision letter point organisations to the standardised (NIST) algorithms. |

**Soft de-facto defaults: this is where NIST's reach is overstated.** These were coloured
NIST under the "engaged, not sovereign, therefore NIST" rule rather than on attestation.
Several should be grey under any disciplined rubric.

| Country | Atlas label | Conf. | Verdict | Recommendation (provisional) |
|---|---|---|---|---|
| Turkey | NIST | Low | **Misattributed** | The profile basis says the one source "names no standards camp, FIPS suite or national scheme; grey beats wrong", yet the colour is NIST. Recommend grey (engaged-but-uncommitted). |
| Ukraine | NIST | Low | **Misattributed** | Same pattern: a conference call-for-papers, no standard named. Recommend grey. |
| Djibouti, Brunei | NIST | Low | **Overstated** | Minimal evidence; recommend grey unless a national adoption is found. |
| Argentina, Chile, Bahrain, Thailand | NIST | Med | **Overstated** | De-facto defaults on thin attestation; recommend engaged-but-uncommitted pending a sourced national adoption. |
| Brazil | NIST | Med | **Holds on facts, unsettled on method** | ITI Normative Instruction 35/2026 folds PQC into ICP-Brasil, which is real NIST adoption, but every supporting row is `included:false` (candidate sources only). Confirm inclusion, then it holds. |
| Norway | NIST | Med | **Overstated (thin)** | NSM runs a migration programme and names the vulnerable *classical* algorithms; explicit adoption of the NIST PQC suite is inferred, not attested. Keep NIST but lower confidence, or treat as contextualiser-leaning adopter. |

---

## 6. Misattribution summary

Countries whose current colour the evidence does not support, prioritised, with the
non-EU cases first as requested.

**Reclassify (label not supported):**

1. **Saudi Arabia**: Sovereign to NIST-aligned (contextualiser). National standard profiling NIST, not a sovereign algorithm.
2. **UAE**: Sovereign to NIST-aligned (mandate-driven contextualiser). Migration mandate, not an algorithm.
3. **Japan**: Mixed to NIST-aligned (contextualiser). CRYPTREC lists NIST algorithms; no national scheme.
4. **European Union (supranational)**: Mixed to conditioner/contextualiser. No algorithm to be "mixed" with.
5. **Turkey**: NIST to grey. No standard named in source.
6. **Ukraine**: NIST to grey. No standard named in source.
7. **France** (secondary): drop "Sovereign". No national algorithm; contextualiser.

**Soften or downgrade confidence (overstated, not necessarily wrong):**

8. **Vietnam**: keep a sovereign lean but mark emerging / low confidence (single research-stage scheme).
9. **Indonesia**: Mixed to engaged-but-uncommitted with sovereign intent.
10. **Germany** (secondary): "Mixed" to contextualiser; FrodoKEM is not a national scheme.
11. **Djibouti, Brunei, Argentina, Chile, Bahrain, Thailand, Norway**: soften toward grey or low-confidence adopter.

**Relabel without changing the bloc (structural):**

12. **United States**: mark as the setter, not an adopter.
13. **The 25 plain EU states**: keep EU coordination, add the hidden algorithm axis (NIST, taker/contextualiser role).

On the counts: of the five Sovereign countries, two are solid (China, Russia), one is
overstated (Vietnam), and two are misattributed (Saudi Arabia, UAE). Of the four Mixed
entries, one holds (South Korea), two are overstated (Japan, Indonesia), and one is
misattributed (the EU). The EU-aligned colour holds as a coordination label for all 27,
with two secondary-label corrections. The NIST colour holds for the established adopters
and is overstated for roughly eight to ten soft de-facto defaults.

---

## 7. Internal inconsistencies surfaced (for the audit trail)

- **Backwards Sovereign**: France (no national algorithm) carries Sovereign; South Korea (four national algorithms) carries only Mixed.
- **Same posture, three labels**: France (EU + Sovereign), Germany (EU + Mixed), Japan (Mixed) are all contextualisers.
- **Self-contradicting basis**: Turkey and Ukraine profiles argue "grey beats wrong" in the basis text, then set the colour to NIST.
- **Setter as follower**: the United States, which writes the standard, shares a colour with countries that merely adopt it.
- **Confidence not load-bearing**: China and Russia (clearest cases) sit at Medium, while several thin de-facto NIST calls also sit at Medium; the grade does not yet track evidential strength.
- **Count drift**: `METHODOLOGY_ISSUE.md` cites 54 coloured countries; the profiles currently yield 55 with a `dominantProcess` (the supranational EU entity is colour-bearing). Reconcile whether supranational entities are counted as countries.

---

## 8. What this means for the headline claim

Stated as data, not interpretation, for the researcher to weigh.

The Atlas's headline is that the world is splitting into cryptographic blocs. The
verification leaves the *sovereign* split intact and arguably sharpens it: China and
Russia run real parallel ecosystems, South Korea runs a cognate national process, and
Vietnam is reaching for one. What it complicates is the *EU-versus-NIST* split, which on
the algorithm axis is not a split at all: the EU bloc runs NIST algorithms under an EU
regulatory wrapper, so it is one coordination bloc inside a single algorithmic baseline,
not a competing standards bloc. And it shrinks the NIST bloc at the margins, because a
chunk of its members are engaged-but-uncommitted states that were defaulted into it.

How much of the "blocs" finding survives that, and how to phrase it, is a judgement for
the thesis. The recommended fix in section 4 is what would let the map make whichever
claim the evidence actually supports.

---

## Sources

- NIST, FIPS 203/204/205 finalised (14 Aug 2024) and FIPS 206 (FN-DSA) draft status: nist.gov/news-events/news/2024/08/nist-releases-first-3-finalized-post-quantum-encryption-standards; csrc.nist.gov FIPS 206 status update (2025).
- EU NIS Cooperation Group, Coordinated Implementation Roadmap for the Transition to PQC, v1.1 (11 June 2025), milestones 2026/2030/2035; ENISA support.
- China NGCC: Institute of Commercial Cryptography Standards announcement (Feb 2025); pqc-forum and The Quantum Insider coverage (18 Feb 2025).
- Russia: TC26 GOST suite; Hypericum (Alekseev et al., 2024) and the Shipovnik/Codiaeum candidates (non-Western standards note).
- South Korea KpqC final selections (16 Jan 2025): PQShield; KpqC competition pages.
- Vietnam VN-PQSign: Government Cipher Committee / VIASM announcement (Feb 2025); Nhan Dan and vietnam.vn coverage.
- Saudi Arabia NCS-1:2020: NCA (nca.gov.sa) National Cryptographic Standards and sharing notice.
- UAE National Encryption Policy and PQC Migration Programme: UAE Cyber Security Council / WAM; Computer Weekly; postquantum.com.
- Japan CRYPTREC PQC Guideline (2024 edition) and ML-KEM Ciphers List evaluation: CRYPTREC; PQShield.
- India: DST "Implementation of Quantum Safe Ecosystem in India" (Feb 2026); MeitY/CERT-In roadmap; ORF; The Quantum Insider.
- Atlas internal: `docs/METHODOLOGY_ISSUE.md`, `docs/REVIEWER_GUIDE.md`, `data/profiles/*.json`, `scripts/apply-eu.mjs`; Fable 5 handover country briefs and non-Western standards note.
