# QSC Atlas assistant: an open, grounded helper for the map

A design document for an assistant that helps a visitor find the right content in the Atlas
and read it in their own context, for example "what does the quantum-safe transition mean
for a Turkish pharmaceutical company with operations in India and the EU". It covers the
technical process (open source, no payment), the theoretical implications, and the process
to build it. The assistant is a retrieval interface over the Atlas's own sourced data, not
a free-generating chatbot, and it is framed as orientation rather than legal advice.

---

## 1. Principle

Three commitments shape every decision below.

- **Open source, no paywall.** The code, the prompts and the retrieval logic live in the
  repository under an open licence. The assistant runs on open or bring-your-own-model
  infrastructure so there is no per-query charge and no vendor lock-in. This keeps the
  assistant a public good and consistent with the Atlas's sources-only, auditable posture.
- **Grounded, never generative about facts.** Answers are built only from retrieved Atlas
  records (country profiles, the regulatory layer, the methodology docs). Every claim cites
  the profile or instrument it came from. Where the Atlas has no data, the assistant says so
  rather than inventing an obligation.
- **Orientation, not advice.** It points a user at the instruments, deadlines and postures
  that apply to them, and says plainly that it is a research instrument, not a compliance
  opinion, with a standing line to confirm with counsel.

---

## 2. Technical process (open source, no payment)

The corpus is small and already structured, which makes a light, fully open design possible.

**Data.** The assistant reads the Atlas's existing open data: the country profiles
(coordination posture, standards role, the regulatory layer of main regulation, legal
status and obligation, confidence, sources) and the public docs (the classification model
and methodology). No new data or licence is required. The internal analytical notes stay
out, as they are redacted from publication.

**Retrieval.** Because the data is a few dozen structured records, retrieval is structured
first: parse the user's context into countries and a sector, then select the matching
profiles and the sector-to-instrument mappings. A light semantic search over the prose
fields (summaries, obligations) can be layered on with an open embedding model and a local
index, but it is optional; keyword and structured filters carry most queries. No proprietary
vector database is needed.

**Generation.** The synthesis step is model-agnostic. It can run on an open-weights model
that the project self-hosts, so there is no per-query payment, or on a bring-your-own-key
basis for those who prefer a hosted model. The prompt receives only the retrieved records
and is instructed to answer from them, cite them, carry their confidence, and refuse when
the data is absent.

**Serving.** A small serverless function or a self-hosted endpoint sits beside the static
site; the site calls it. A fully client-side variant with a local model is possible for
privacy-sensitive users. Either way the deployment is reproducible from the repository.

**Guardrails.**

- Grounding: the answer may use only retrieved records; unsupported statements are removed
  before display.
- Citation: each country or instrument named links back to its profile or source document.
- Confidence: the Atlas's confidence grade for each country is surfaced, so a low-confidence
  reading reads as tentative.
- Refusal: out-of-scope questions, and questions the data cannot answer, return a plain "the
  Atlas does not record this" rather than a guess.
- Register: a persistent orientation-not-advice notice, and no language that implies a
  compliance verdict.
- Audit: queries and the records used are logged, so any answer can be reconstructed.

**Data flow.** User context, then structured retrieval of the relevant country and sector
records, then assembly of a grounded context with sources and confidence, then synthesis
with citations and the disclaimer, then return. Every step is inspectable.

---

## 3. Theoretical implications

An assistant over the Atlas is not a neutral convenience; it changes who can read the
transition and on what terms.

**It widens who can act.** Reading one's own exposure across several jurisdictions and
sectors is, today, work that needs a consultant. An assistant lowers that cost, so a smaller
organisation can form a view and act. In the governance-of-expectations terms the Atlas
rests on, widening who can form and act on expectations is itself a coordination effect: the
assistant becomes a coordination device, helping dispersed actors align on what to expect
and do in a transition no one governs.

**It tests the line between instrument and oracle.** A model that speaks for an authority
instrument can be confidently wrong. Grounding, citation and surfaced confidence are what
keep it an instrument that points to sources rather than an oracle that issues verdicts. The
same redaction discipline that keeps the internal analytical notes off the public site
applies to the assistant: it conveys the sourced public layer, not private interpretation.

**Open source is a stance, with a boundary.** Releasing the assistant as open and free
states that the orientation layer is a public good, not a metered product. That is in
tension with the commercial advisory capacity, and the boundary should be explicit: the free
assistant does discovery and orientation; the human advisory practice does the paid depth,
the bespoke analysis, and the judgement the assistant is told not to make.

**It risks automating interpretation.** An assistant can de-skill its users and invite
over-reliance on a provisional dataset. The mitigations are the framing (orientation, not
advice), the visible confidence, and keeping humans in the loop for any decision with
compliance weight.

---

## 4. The process to build it

**Prerequisite.** The assistant is gated on data precision. The killer query, the Turkish
pharmaceutical example, needs the sector overlay (which sectors are in scope of which
instrument) and field-level sourcing and confidence. Without them the assistant can only
give country-level generalities. Build the data layer first.

The phases:

1. **Scope and test set.** Curate around thirty representative queries, including the
   multi-jurisdiction sector case, and write acceptance criteria: grounded, correctly cited,
   accurate against the profiles, and a clean refusal when the data is absent.
2. **Retrieval.** Structured filtering over the profiles and the sector mappings first; add
   light semantic search only if the test set shows it is needed.
3. **Prompt and guardrails.** Grounding, citation, confidence, the disclaimer, and refusal
   behaviour, all enforced in the prompt and checked in post-processing.
4. **Evaluation.** Measure grounding accuracy, citation correctness, the rate of unsupported
   claims, and refusal behaviour against the test set. Add an expert spot-check, drawn from
   the same reviewers as the engagement plan, on a sample of answers.
5. **Beta.** A thin public version, clearly labelled as orientation and beta, with feedback
   capture, then iterate. The contextual depth follows once the sector data is solid.

**Roles.** A software engineer for the retrieval and serving, a data analyst to keep the
profiles and sector mappings current, and a domain reviewer to validate answers. These are
the same roles the project already needs for the data layer.

**Risks and mitigations.**

- Wrong or stale guidance: ground every claim, surface confidence and the last-updated date,
  and refuse when uncertain.
- Liability: the orientation-not-advice frame, the disclaimer, and no compliance verdicts.
- Exposing thin data: confidence is visible, and low-confidence cells are flagged rather than
  smoothed over.
- Maintenance load: reproducible deployment, a small test set run on each data change.

---

## 5. Worked example

A Turkish pharmaceutical company with operations in India and the EU asks how to transition.
The assistant resolves the context to three profiles plus the sector mapping for
pharmaceuticals, then answers from them: Türkiye is engaged but unaligned with no binding
obligation, so plan to the NIST baseline; the EU operations are the binding pressure, since a
pharmaceutical manufacturer is likely an essential or important entity under NIS2, on the
coordinated 2030 and 2035 timeline; India anchors algorithm validation on NIST with a
maturing roadmap and no pharma-specific mandate yet. The synthesis: all three sit in the
NIST orbit, so one adoption of the FIPS algorithms satisfies all of them, and the clock that
matters is the EU's. Each country statement cites its profile and carries its confidence, and
the answer closes with the orientation-not-advice line. The example also shows the
dependency: without the sector overlay the assistant could not place a pharmaceutical
manufacturer within NIS2.

---

## Sources

- Hohm, Heinemann and Wiesmaier (2022), Crypto-Agility Maturity Model, arXiv:2202.07645
  (crypto-agility and inventory dimensions the assistant reports on).
- von Nethen, Wiesmaier, Alnahawi and Heinrich (2023), PQC Migration Management Process,
  arXiv:2301.04491 (the inventory, risk and timeline steps a user is oriented through).
- Le, Do, Dinh and Pham (2025), Are Enterprises Ready for Quantum-Safe Cybersecurity?,
  arXiv:2509.01731 (the readiness gap the assistant helps close, and the sectoral pattern).
- Atlas internal: `CLASSIFICATION_MODEL.md`, `REGULATORY_LAYER_SPEC.md`,
  `CLASSIFICATION_VERIFICATION_MEMO.md`.
