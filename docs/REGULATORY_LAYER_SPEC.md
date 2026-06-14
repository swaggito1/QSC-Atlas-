# QSC Atlas: regulatory layer specification

A specification, not a population pass. It defines four new country-profile fields that
turn the Atlas from a classification map into a regulation-anchored reference suitable for
a policy or CEPS-style report: a **main regulation** reference, a **legal status**
(bindingness) tag, a **plain-language obligation**, and an **analytical note**. It sets
out their controlled values, where they live in the data, how a profile renders with them,
and the rules for authoring them, with worked examples. Populating the 55 coloured
profiles is the next step, not part of this document.

Companion to `CLASSIFICATION_MODEL.md` (the two-axis typology) and
`CLASSIFICATION_VERIFICATION_MEMO.md` (the verdicts).

---

## 1. Design principle: regulation first, theory light

The current profile leads with the classification (coordination posture and standards
role). That pair is the thesis's analytical typology, so the map currently argues a thesis
position. For a policy or CEPS report the emphasis should invert: the binding instrument
and what it requires lead; the typology recedes to a small secondary tag.

Two rules follow from this and govern everything below.

1. **The regulatory spine leads the profile.** Main regulation, legal status, obligation,
   and timeline come first. Coordination posture and standards role drop to a tagged
   footer that links to `CLASSIFICATION_MODEL.md` for anyone who wants the analytical
   frame.
2. **The prose is written in a policy register, not the thesis register.** The obligation
   and analytical note describe instruments, requirements, and gaps. They do not use the
   thesis's theoretical vocabulary (see the banned-terms list in section 5). The
   setter / contextualiser / taker language stays in the tag, never in the note.

---

## 2. The four new fields

### 2.1 `mainRegulation` (text, one instrument per line)

The governing instruments behind a country's QSC posture, each tagged with its level and
its binding character. Stored as text in the established Atlas convention (one item per
line, fields separated by " | ", the same pattern as Gov Actors and Process Participation),
because most countries combine a binding general instrument with softer PQC-specific
guidance and the combination is the point. Each line is `instrument | level | status`,
parsed by `parseRegulation` in `src/lib/parse.ts`:

| Field (in order) | Values |
|---|---|
| instrument | Formal short name with citation, e.g. "NIS2 Directive (EU) 2022/2555, Art. 21(2)(h)". |
| level | `national` / `EU` / `transnational` |
| status | `binding-law` / `binding-by-market-access` / `soft-law` / `guidance` |

`status` controlled vocabulary:

- **`binding-law`**: a statute, regulation, transposed directive, or executive instrument
  with legal force (for example China's Cryptography Law 2020; US NSM-10 for federal
  agencies; NIS2 and DORA as EU law).
- **`binding-by-market-access`**: not a statute, but compliance is effectively required to
  sell or operate, through certification or procurement (ANSSI's security visa; FIPS
  validation via CMVP for US federal procurement).
- **`soft-law`**: formally non-binding but officially adopted, with policy weight
  (Commission Recommendation (EU) 2024/1101; the NIS Cooperation Group coordinated
  roadmap).
- **`guidance`**: agency technical guidance or advisory, no obligation attached (a
  national agency's migration roadmap or handbook).

### 2.2 `legalStatus` (enum, summary)

A single roll-up of `mainRegulation`, for the profile headline, map filtering, and report
tables.

- **`binding`**: at least one `binding-law` or `binding-by-market-access` instrument.
- **`soft-only`**: only `soft-law` or `guidance` instruments.
- **`none`**: no instrument on record (the `engaged-unaligned` posture, or no data).

Derive it from the array rather than hand-setting it, so the two cannot drift apart. Where
binding force covers only part of the economy (a sector, or certified products only), keep
`legalStatus` as `binding` and let the obligation and note carry the scope nuance.

### 2.3 `obligation` (string, plain language)

What a regulated organisation in that country must actually do. One to three sentences,
plain language, no jargon and no theory. If nothing is required, say so ("No binding PQC
obligation; activity is research and convening only").

### 2.4 `analyticalNote` (string, internal, redacted before publication)

A short interpretive note in a policy register: how the instruments fit together, what is
distinctive, and where the gap between stated policy and practice sits. Two to four
sentences. It may interpret, but it flags inference with a plain marker ("Watch point",
"Gap"). It draws on the stakeholder evidence only as aggregate coded findings, never by
naming or characterising participants (section 5).

**Visibility: internal working field, redacted before publication.** The note exists for
drafting and report-writing. It is not read by the site loader (`src/content.config.ts`)
and is not added to the Notion source, so the published site can never render it; it
persists only in the canonical JSON mirror (`data/profiles/*.json`). Because it is never
published, it can carry the aggregate,
stakeholder-derived watch points that the public fields should not, while still observing
the anonymisation rule (aggregate only, no participants). Treat anything written here as
removed from the final artefact: the durable, public analytical signal is the classification
tags (section 4), not this note.

---

## 3. Data model

New fields sit alongside the existing ones; nothing is removed. Legacy and Option A fields
(`dominantProcess`, `coordinationPosture`, `standardsRole`, `migrationTimeline`,
`confidence`, `verificationStatus`, sources) are retained and unchanged.

```json
{
  "iso3": "FRA",
  "mainRegulation": "NIS2 Directive (EU) 2022/2555, Art. 21(2)(h) | EU | binding-law\nDORA, Regulation (EU) 2022/2554 (financial sector) | EU | binding-law\nANSSI PQC migration roadmap (2022; phases 2025/2030/2035) | national | guidance\nANSSI Common Criteria security visa, PQC requirements | national | binding-by-market-access",
  "legalStatus": "binding",
  "obligation": "Essential and important entities must use state-of-the-art cryptography under NIS2; products seeking ANSSI certification must meet its PQC requirements, including mandatory hybridisation, by the visa deadlines (2027 sensitive products, 2030 all certified products).",
  "analyticalNote": "France enforces migration through certification and market access rather than a dedicated post-quantum statute, and layers national requirements (mandatory hybridisation, larger key sizes) over the NIST baseline. Watch point: the binding deadlines bite on certified products first, so the wider economy moves on the softer NIS2 'state-of-the-art' trajectory."
}
```

Notion mirror (`ATLAS_COUNTRIES`): add `Main Regulation` (text), `Legal Status` (select:
binding / soft-only / none), and `Obligation` (text). Do not add `Analytical Note` to
Notion: it stays in the canonical JSON only, so the published pipeline never sees it
(section 2.4). Pull corrections back to `data/profiles/*.json` per the source-of-truth note
in `REVIEWER_GUIDE.md`.

If instruments are likely to be queried in their own right (every country bound by NIS2,
say), promote `mainRegulation` to a small `ATLAS_REGULATIONS` table and reference it by ID,
the same actor-ID-first pattern the coordination-device rules already use. For a first pass
the inline array is enough.

---

## 4. Profile rendering order

The reframe is mostly a reordering. Top to bottom:

1. **Country name and one-line summary.**
2. **Regulatory spine (lead).** `mainRegulation` as a short list, each instrument a chip
   showing its name, a `level` label, and a `status` badge. Then the `legalStatus`
   headline (Binding / Soft-only / None). Then the `obligation` in plain language (kept,
   public). Then the existing migration timeline and target.
3. **Analytical note (working view only).** Shown while drafting; removed from the
   published profile (section 2.4).
4. **Classification tags (kept, public).** Coordination posture and standards role as
   small tags, with confidence and verification status, linking to
   `CLASSIFICATION_MODEL.md`. Retained: once the note is redacted, these are the profile's
   standing analytical signal.
5. **Sources.** The institutional documents, unchanged.

Status badges reuse the existing restraint of the palette: binding instruments in the
solid ink, soft-law and guidance in a lighter tone, so bindingness is legible at a glance
without adding a second functional colour to the map itself. The map's country colour is
unaffected by this layer; the regulatory spine lives on the profile and in report tables.

### 4.1 Field visibility: working view versus published view

Two renders from one record. The working view is for drafting and report-writing; the
published view is what ships on the public site and in any exported report.

| Field | Working view | Published view |
|---|---|---|
| `mainRegulation` | shown | shown |
| `legalStatus` | shown | shown |
| `obligation` | shown | **kept** |
| classification tags (`coordinationPosture`, `standardsRole`, confidence, status) | shown | **kept** |
| `analyticalNote` | shown | **redacted** |
| sources | shown | shown |

The publish and export step is the single point that drops `analyticalNote`; every other
field passes through unchanged. Keeping the obligation and the classification tags in the
published view, and redacting only the note, is the intended split: the public profile is a
sourced regulatory reference with a light analytical tag, and the heavier interpretation
stays internal.

---

## 5. Authoring rules

**Policy register, not thesis register.** The `obligation` and `analyticalNote` are policy
prose. Do not use, in that prose: "governance of expectations", "tentative governance",
"network of expectations", "scattered governance", "standard-setter / contextualiser /
taker", or "expectation" as a term of art. Those belong to the typology tag and to the
thesis, not to the regulatory layer. Say what the instrument requires and where it falls
short.

**CEPS anonymisation (non-negotiable).** Any insight drawn from the stakeholder corpus is
cited only as an aggregate coded finding. No participant names. No characterisation of
participants by actor type. Prefer published instruments as the basis for the obligation
and note; use the stakeholder evidence only for cross-cutting observations (for example the
documented gap between mandate and migration), and only in aggregate.

**Evidence-anchored.** Every instrument in `mainRegulation` and every claim in `obligation`
traces to a sourced document already in the profile's sources, or a new source is added.
The `analyticalNote` may interpret beyond the documents, but inference is marked plainly
("Watch point", "Gap"), never asserted as sourced fact.

**House style.** British English, no em-dashes or en-dashes, consistent with the other
docs. Obligation one to three sentences; analytical note two to four.

---

## 6. Worked examples

Two built out in full, two in brief, spanning the `legalStatus` range.

### United States (legalStatus: binding)

- **Main regulation:** NSM-10 (2022, `binding-law`, national); OMB M-23-02 inventory
  reporting (2022, `binding-law`, national); EO 14144 (2025, `binding-law`, national, later
  amended by EO 14306); FIPS 203/204/205 with CMVP validation for federal procurement
  (`binding-by-market-access`, national); CNSA 2.0 for national security systems
  (`binding-law`, national).
- **Obligation:** Federal agencies must inventory their cryptography, report annually, and
  migrate to the NIST FIPS algorithms on the mandated timelines; national security systems
  follow CNSA 2.0. There is no economy-wide private-sector mandate.
- **Analytical note:** The United States both writes the algorithms and binds its own
  agencies to them, so its instruments are the most direct in the sample. Watch point:
  obligations are federal; private-sector migration runs on procurement pull and market
  deployment rather than law, and the 2025 executive-order amendment shows the timeline is
  politically revisable.

### France (legalStatus: binding)

The JSON in section 3. Binding EU law (NIS2, DORA) plus a non-statutory national roadmap
plus certification that binds through market access. The note names the gap: deadlines bite
on certified products first.

### European Union, supranational (legalStatus: binding, PQC-specific soft)

- **Main regulation:** NIS2 and DORA (`binding-law`, EU) set the general obligation;
  Commission Recommendation (EU) 2024/1101 and the NIS Cooperation Group coordinated
  roadmap (`soft-law`, EU) are the PQC-specific instruments.
- **Obligation:** No binding PQC-specific requirement at EU level; member states are
  encouraged to publish national roadmaps and migrate on the coordinated 2026 / 2030 / 2035
  timeline, while NIS2's "state-of-the-art" duty is expected to absorb PQC over time.
- **Analytical note:** The binding force is general and the PQC-specific steer is soft, so
  the EU sets timeline and direction rather than a hard mandate. Watch point: the
  "state-of-the-art" clause is the lever through which soft coordination is expected to
  harden into obligation without new legislation.

### Türkiye (legalStatus: none)

- **Main regulation:** none on record.
- **Obligation:** No binding PQC obligation; activity is a national authority awareness
  programme only.
- **Analytical note:** Türkiye is active on the transition but has named no standard,
  instrument, or timeline, which is why it sits at `engaged-unaligned`. Adding it here keeps
  the absence explicit rather than defaulting it into a bloc.

---

## 7. Implementation status and next steps

**Done.** The three public fields and the internal note are wired into the code:
`src/lib/regulation.ts` (labels and `deriveLegalStatus`), `parseRegulation` in
`src/lib/parse.ts`, the loader and schema in `src/content.config.ts` (the note deliberately
excluded), the lead "Regulatory basis" section in `src/components/ProfilePanel.astro`, and
validation in `scripts/update-profile.mjs`. Nine well-evidenced profiles are populated in the
canonical mirror: USA, FRA, DEU, NLD, EUU, CHN, RUS, KOR, and TUR (the `none` case).

**Next.** Sync the populated profiles to Notion and deploy
(`node scripts/update-profile.mjs data/profiles/USA.json ... --deploy`); the analytical note
is not synced. Then extend to the remaining coloured countries, carrying `confidence`
through so a low-confidence camp does not acquire a confident-sounding obligation. The soft
de-facto cases from the verification memo will often resolve to `legalStatus: none` with a
one-line note, which is the correct, honest outcome rather than a gap to fill.
