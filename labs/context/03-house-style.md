# Context 03: house style for everything a visitor reads or sees

## voice

British English throughout: "programme", "organisation", "licence" as a noun, "per cent" in running prose, dates as "20 January 2026". Active voice. Sentence length varies on purpose, short statements next to longer ones that carry reasoning. Prose first: explanatory text is written in paragraphs, and lists appear only where a reader scans or compares (legends, filters, tables). Plain terms from the visitor's side of the screen; the calm, exact register of a good standards document. Labels label, summaries inform, nothing sells by adjective.

## hard rules, enforced by `labs/tools/style-scan.mjs`

No em dashes or en dashes anywhere, including headings, figures, chart labels, alt text, code comments, commit messages and data files. Ranges read "2025 to 2036" or "24 to 72 hours". Banned vocabulary: <!-- style-scan-ignore --> delve, robust (outside statutory titles), leverage, foster, holistic, comprehensive (outside proper nouns), landscape (outside proper nouns), realm, moreover, furthermore, additionally, notably, crucial, pivotal, intricate, seamless, underscore, navigate, tapestry, nuanced, multifaceted. Banned phrases: <!-- style-scan-ignore --> bottom line, taken together, perhaps most importantly, put simply, here's the thing, at its core. A proper noun that contains a banned word (a statute, a NATO policy title) goes in `labs/tools/style-allow.txt`. Verbatim excerpts from sources are the one exception to these rules: a quotation keeps the source's punctuation and words, and the scanner exempts the JSON keys that hold them (`excerpt`, `documentTitle`, `definitionVerbatim`, `sourceTitle`, `quote`).

## capped patterns, reported as WATCH

<!-- style-scan-ignore --> Use each sparingly and never stack them: "not X but Y" pivots, sentence-final "X, not Y." contrasts, enumeration openers such as "Three things matter", spatial verbs for abstractions (sits, lands, lives), architecture metaphors (load-bearing, forcing function, machinery). One per page is plenty.

## vocabulary a visitor never sees

No Triple Helix, Governance of Expectations, expectation modes, code families (EXP, INST, TRANS, RE, OPER), tiers T1 to T4 as analytical labels outside the documents tool's existing tier code, helix strength, imbalance metrics, or theory-of-agency language. The Atlas's public classification words are allowed: "NIST-led ecosystem", "EU coordinated roadmap", "Sovereign bloc", "Engaged but unaligned", and the role badges "Standard-maker", "Standard-contextualiser", "Standard-taker", "Sovereign developer".

## claims and hedges

Say what the record shows and say where it stops. "Recorded in an institutional document held by the Atlas" is honest; "adopted" is a stronger claim and needs the document to say so. Absence of a record is stated as absence of a record, never as absence of activity. Confidence travels with every classification a tool displays. Probabilities are shown as the survey's ranges with the survey's own definition, never as a single number and never rounded into a headline. Nothing reads as legal advice: every tool that touches obligations carries the standing note "The Atlas is a research instrument. It does not tell you whether you are compliant; confirm obligations with counsel."

## citations on the page

Each tool has a short method note and a sources list in APA 7 style with working links, set in the reading face. Inline, a figure's source appears as a quiet link beneath it. Verbatim excerpts shown to the visitor stay under 60 words and are quoted exactly.

## visual rules

Ink on warm paper. Colour encodes coordination posture and nothing else, taken from `POSTURE_META`. Probability bands, deadlines without a jurisdiction, legal status and time are shown with ink tints, weight, dash pattern and the solid versus open marker convention: solid for a finding made or an instrument in force, open for a finding pending or an instrument proposed, dashed outlines for proposals, dashed lines for interpolation. No gradients, glows, drop shadows on data, 3D effects or decorative motion. Motion explains a change in state and stops; everything animated has a static equivalent under `prefers-reduced-motion`. Thin strokes (1 to 1.5 px), generous whitespace, square corners (2 px radius). Numbers and dates in Spline Sans Mono with tabular figures. Reading text in Newsreader at a 68 character measure. Instrument text in Schibsted Grotesk.

## accessibility floor

Keyboard access to every control and every data point that has a detail view. Visible focus. SVG charts carry `<title>` and `<desc>` and a data table alternative reachable in one step. Live readouts update through an `aria-live="polite"` region. Contrast meets WCAG 2.2 AA for text. The posture colours are already chosen to separate under common colour vision deficiencies; labels always accompany them.

## the share affordance

Every tool state that a visitor might want to send to a colleague is encoded in the URL query string, so a copied link reproduces the view. Where an image is useful, the tool renders a 1200 by 630 PNG client-side from its own SVG, with the source line and the "as of" date burnt into the image.
