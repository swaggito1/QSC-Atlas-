# QSC Atlas: middle-power layer specification

A specification, not a population pass. It defines an analytical layer that reads each
country through middle-power theory, turning the Atlas from a classification map into an
instrument that can also argue a theory-of-agency position: who, among the states that did
not write the post-quantum standard, is nonetheless shaping it. The layer adds one genuinely
new input field, a small set of derived fields, and a secondary profile section. It changes
no existing field and, by default, no map colour. Populating the profiles is the next step,
not part of this document.

Companion to `CLASSIFICATION_MODEL.md` (the two-axis typology), `REGULATORY_LAYER_SPEC.md`
(the field-and-render template this spec follows), and the research review "converging
middle-power theory with the quantum-safe transition" (the analytical grounding).

---

## 1. Design principle: a reading on top, not a new spine

The Atlas's structural map answers where a country stands. The regulatory layer answers what
its instruments require. This layer answers a third question, analytical rather than
structural: how strongly is the country exercising middle-power agency in the transition,
that is, shaping a standard it did not set. Three rules follow and govern everything below.

1. **The layer is derived, not asserted.** With one exception, every field computes from data
   the Atlas already holds (coordination posture, standards role, government actors, the
   regulatory layer). The single new input is a country's standing in the middle-power
   literature, which is a judgement, not an Atlas verdict, and is tagged as such.
2. **Colour keeps its single meaning.** Coordination posture remains the only thing the
   default map colour encodes. The middle-power category is shown on the profile and, at most,
   as an *optional alternate recolour*, the same affordance the Atlas already offers for
   standards role. It never becomes a second default colour.
3. **Sourced and analytical are visibly separated.** The structural and regulatory fields are
   sourced from institutional documents. The middle-power fields are an analytical reading.
   The profile section labels itself as such, so a reader never mistakes the agency reading
   for a sourced classification.

---

## 2. The new fields

### 2.1 `irMiddlePower` (enum, the one new input)

A country's standing in the international-relations middle-power literature. This is the only
field a human must set; everything else derives. Controlled vocabulary:

| value | meaning |
|---|---|
| `established` | canonical or digital middle power (e.g. France, Japan, South Korea, Australia) |
| `rising` | rising or emerging middle power (e.g. India, Singapore) |
| `great-power` | a pole, not a middle power (United States, China, Russia) |
| `small-other` | small or minor state for the purposes of this layer |

Each non-trivial call carries a one-line basis in the source note (the author and work that
supports it: Holbraad, 1984; Cooper, Higgott, & Nossal, 1993; Pannier, 2023). Contested calls
(the United Kingdom is the standing example) are set with a visible `confidence` of `medium`
and a note, never asserted flatly.

### 2.2 `middlePowerCategory` (enum, derived)

The country's position in the quantum-safe transition read through middle-power theory.
Derived from `irMiddlePower`, `coordinationPosture`, and `standardsRole` by
`deriveMiddlePowerCategory` in a new `src/lib/middlepower.ts` (mirroring `deriveLegalStatus`
in `src/lib/regulation.ts`), so it cannot drift from the structural fields.

| value | rule (in evaluation order) |
|---|---|
| `standard-maker` | `standardsRole = standard-maker` |
| `sovereign-autarky` | `standardsRole = sovereign-developer` |
| `convergent-contextualiser` | `standardsRole = standard-contextualiser` |
| `coalition-coordinating` | `coordinationPosture = EU-roadmap` and `standardsRole = standard-taker` |
| `latent-taker` | `standardsRole = standard-taker`, `coordinationPosture = NIST-led`, and `irMiddlePower` in {established, rising} |
| `following-taker` | `standardsRole = standard-taker` and `irMiddlePower = small-other` |
| `absent-unaligned` | `coordinationPosture = engaged-unaligned` |

The interesting category is `latent-taker`: a middle power with the capability to contextualise
that adopts the baseline as published. It is the layer's main analytical payload, because it
marks the gap between middle-power capability and middle-power behaviour.

### 2.3 `mpAgency` (object, four sub-scores, derived)

How strongly the country exercises middle-power agency, scored by design rather than by
outcome, on four criteria. Each is `none` / `low` / `medium` / `high` (with two off-scale
values where the position leaves the middle-power frame). Computed by `scoreMpAgency` in
`src/lib/middlepower.ts` from the fields named.

| sub-score | what it scores | reads from | grounding |
|---|---|---|---|
| `contextualisation` | national requirements overlaid on the baseline (hybridisation, key sizes, certification, national evaluation) | `standardsRole`; regulatory layer | niche / technical leadership (Cooper, Higgott, & Nossal, 1993) |
| `autonomy` | national requirements asserted while interoperability is kept; `autarky` if interoperability is traded away | `standardsRole` | autonomy-versus-dependence (Holbraad, 1984; Pannier, 2023) |
| `coordination` | shaping a collective transition: anchoring a roadmap, running a watched competition, holding standards-body seats | `coordinationPosture`; gov actors | coalition-building (Cooper, Higgott, & Nossal, 1993) |
| `capacity` | a lead authority, certification body, and evaluation process equal to the task | gov actors; regulatory layer | absorptive capacity |

Scoring is by design: it records whether the apparatus and the behaviour are present, not
whether they have succeeded, because the field cannot yet show outcomes (after Vance, 2025,
as the evaluative layer also does). The four are shown as four sub-scores, never summed into a
single agency number.

### 2.4 `mpNote` (string, internal, redacted before publication)

A short interpretive note, two to four sentences, on how the country sits in the middle-power
reading: which behaviour earns the category, or, for a `latent-taker`, the likeliest reason
capability is not being exercised (alliance depth, certification tradition). Marked inference
with a plain flag ("Watch point", "Reading"). **Visibility: internal working field, redacted
before publication**, exactly as `analyticalNote` in the regulatory layer: it lives only in
the canonical JSON mirror (`data/profiles/*.json`), is excluded from the loader in
`src/content.config.ts`, and is never added to Notion, so the published site cannot render it.

---

## 3. Data model

New fields sit alongside the existing ones; nothing is removed. The Option A and regulatory
fields (`coordinationPosture`, `standardsRole`, `mainRegulation`, `legalStatus`, `obligation`,
`confidence`, sources) are retained and unchanged.

```json
{
  "iso3": "FRA",
  "coordinationPosture": "EU-roadmap",
  "standardsRole": "standard-contextualiser",
  "irMiddlePower": "established",
  "middlePowerCategory": "convergent-contextualiser",
  "mpAgency": {
    "contextualisation": "high",
    "autonomy": "high",
    "coordination": "high",
    "capacity": "high"
  },
  "mpNote": "France is the clearest convergent case: ANSSI overlays mandatory hybridisation and certification on the NIST baseline while coordinating inside the EU roadmap. Reading: a national cryptographic-sovereignty tradition makes contextualisation the default posture."
}
```

Notion mirror (`ATLAS_COUNTRIES`): add `IR Middle Power` (select: established / rising /
great-power / small-other) and `Middle Power Category` (select, the seven values). Store
`mpAgency` as the established one-item-per-line text convention (`sub-score | level`), parsed
the way `parseRegulation` parses `mainRegulation`, or promote it to four select fields if
map-filtering by a sub-score is wanted. Do not add `mpNote` to Notion: it stays in the
canonical JSON only, so the published pipeline never sees it. Pull corrections back to
`data/profiles/*.json` per the source-of-truth note in `REVIEWER_GUIDE.md`.

Because `middlePowerCategory` and `mpAgency` derive, the build should recompute them from
`irMiddlePower` plus the structural fields at load, not trust hand-set values, so a change to a
country's standards role cannot leave a stale category behind.

---

## 4. Profile rendering order

The layer is one section, added low on the profile, after the classification tags and before
sources. Top to bottom the profile becomes:

1. Country name and one-line summary.
2. Regulatory spine (the regulatory layer's lead).
3. Classification tags: coordination posture and standards role, with confidence.
4. **Middle-power reading (new, analytical).** A labelled section, headed so the reader knows
   it is an analytical layer, not a sourced classification. It shows: the
   `middlePowerCategory` as a single tag; the four `mpAgency` sub-scores as small chips
   (contextualisation, autonomy, coordination, capacity); and a one-line plain gloss of the
   category ("adopts the baseline, sets national terms on top"). It links to the research
   review and to `CLASSIFICATION_MODEL.md` for the frame. The `mpNote` is shown in the working
   view only and redacted from the published profile.
5. Sources.

Rendering lives in `src/components/ProfilePanel.astro` as a new section component, reusing the
chip and tag styles already defined for the regulatory and classification fields. No new
functional colour is introduced; the sub-score chips reuse the existing light/solid tonal
treatment (high in the solid ink, low in the lighter tone).

### 4.1 Optional alternate map view

The Atlas already supports recolouring the map by standards role. This layer may add one
further optional recolour, by `middlePowerCategory`, as a toggle, not a default. Its value is
that it renders the central finding directly: the convergent contextualisers, the latent
takers, and the EU coalition fall out as distinct regions, and the latent middle powers
(Canada, the United Kingdom) become visible as the anomaly the research review turns on. The
default map colour stays coordination posture; this is a view, not a re-spine.

---

## 5. Authoring rules

**One judgement, then derivation.** Only `irMiddlePower` is set by hand, and only it needs a
cited basis from the middle-power literature. `middlePowerCategory` and `mpAgency` are
computed; do not hand-edit them, or the layer loses its reproducibility.

**Sourced versus analytical, stated.** The section is labelled an analytical reading. The
middle-power vocabulary (convergent, latent, contextualiser-as-middle-power) lives in this
section and the review, never in the regulatory `obligation` or in the sourced classification
tags, which keep the Atlas's own maker / contextualiser / taker language.

**Provisional and confidence-carried.** Every category and sub-score inherits the country's
Atlas `confidence`, so a medium-confidence structural call yields a medium-confidence agency
reading. The layer is read under governance of expectations: it scores present behaviour in an
unfinished transition and expects the reading to move.

**No composite.** Never sum the four sub-scores into a single agency score or rank. Four
transparent sub-scores with their basis is what separates a defensible reading from a league
table the evidence cannot support.

**House style.** British English, no em-dashes or en-dashes, consistent with the other docs.
`mpNote` two to four sentences; category gloss one line.

---

## 6. Worked examples

Four, spanning the categories that carry the argument.

### France (convergent-contextualiser)

The JSON in section 3. An established middle power that contextualises inside the EU roadmap:
ANSSI hybridisation and certification over the NIST baseline. All four sub-scores high. The
clean positive case.

### South Korea (convergent-contextualiser, near the autarky boundary)

`irMiddlePower: established`; `standardsRole: standard-contextualiser`;
`coordinationPosture: NIST-led`. Sub-scores: contextualisation high, autonomy high,
coordination high, capacity high. Note: runs its own national post-quantum competition (the
behaviour of a sovereign developer) yet keeps its algorithms NIST-interoperable (the discipline
of a contextualiser), which is why it scores high on autonomy without tipping into
`sovereign-autarky`. The boundary case that defines where middle-power autonomy ends.

### United Kingdom (latent-taker)

`irMiddlePower: established` (confidence medium, contested in the literature);
`standardsRole: standard-taker`; `coordinationPosture: NIST-led`. Sub-scores:
contextualisation low, autonomy low, coordination low, capacity medium. Note: a canonical
middle power that adopts the baseline as published. Watch point: deep intelligence-alliance
integration and trust in the maker's cryptography are the likeliest reasons capability is not
expressed as contextualisation. The anchor case for the latent-middle-power puzzle.

### Indonesia (absent-unaligned)

`irMiddlePower: established`; `coordinationPosture: engaged-unaligned`; no standards role on
record. `middlePowerCategory: absent-unaligned`; sub-scores none or low across the board. Note:
a state that theorises its own middle-power status yet has made no cryptographic commitment.
The Global-South gap between middle-power ambition and transition action, kept explicit rather
than defaulted into a bloc.

---

## 7. Implementation status and next steps

**Not yet built.** This is a specification. The structural and regulatory layers it depends on
are in place (`src/lib/regulation.ts`, `parseRegulation`, the loader in
`src/content.config.ts`, `ProfilePanel.astro`, `scripts/update-profile.mjs`), so the layer
follows their pattern rather than introducing new machinery.

**Next, in order.**

1. Add `src/lib/middlepower.ts` with `deriveMiddlePowerCategory` and `scoreMpAgency`, the two
   pure functions that compute the derived fields from `irMiddlePower` plus the structural
   fields.
2. Extend the schema and loader in `src/content.config.ts` to read `irMiddlePower`,
   `middlePowerCategory`, and `mpAgency`, and to exclude `mpNote` (as the regulatory loader
   excludes `analyticalNote`).
3. Add the middle-power section to `ProfilePanel.astro`, reusing the chip and tag styles.
4. Set `irMiddlePower` on the coloured profiles in `data/profiles/*.json` (the one human input;
   the seed values are in the accompanying crosswalk dataset), let the derived fields compute,
   and reconcile by a second reviewer before publication, the validation discipline the
   evaluative layer uses.
5. Optional: add the `middlePowerCategory` map recolour as a toggle in the map island.
6. Sync to Notion and deploy via `scripts/update-profile.mjs` and the deploy hook; `mpNote` is
   not synced.

The crosswalk dataset (`QSC_Atlas_MiddlePower_Crosswalk.xlsx`) already carries the seed
`irMiddlePower`, the derived category, and the four sub-scores for all fifty-four recorded
countries, so step 4 is a transcription and review pass, not a fresh classification.
