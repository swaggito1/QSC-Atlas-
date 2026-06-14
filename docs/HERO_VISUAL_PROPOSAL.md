# QSC Atlas: hero visual proposal

A bold, minimal, moving hero that integrates with the existing interactive map. The
recommended concept is prototyped and rendered (see `public/qsc-hero-prototype.html`),
which doubles as the feasibility proof. This document gives the concepts, the detailed
prompt (build and generative), the palette, the shape vocabulary, and a verified
technical-feasibility section.

---

## 1. What I checked first

- **The design system.** `docs/qsc-atlas-3-design-brief.md` and `src/styles/global.css`:
  a monochrome instrument, ink on warm paper, with colour permitted in exactly one role
  (standards encoding). The map is the hero; motion is "sparing and functional, nothing
  animates for atmosphere"; reduced motion is respected.
- **The live interactive.** `src/components/AtlasMap.tsx` renders an SVG `d3-geo`
  `geoNaturalEarth1` choropleth (React island, `client:load`), fetching `world-atlas`
  topojson at runtime, with hover tooltips, a slide-in profile, and a coordination/role
  colour toggle. The live homepage already has a "drawing the world..." loading moment.
- **Technique and feasibility** (sources at the end): SVG `stroke-dashoffset` draw-on,
  `d3.geoInterpolate` great-circle arcs, the opt-in `prefers-reduced-motion` pattern, and
  the dotted-globe motif (which is always done dark and neon, so going ink-on-paper is the
  on-brand divergence).

The conclusion that shapes everything: the brief forbids decorative motion, so the visual
must be bold through restraint and precision, not through a generic futuristic-startup look.
The boldness comes from confident scale, a single disciplined idea, and movement that reads
as the instrument computing the world, not as atmosphere.

---

## 2. Two concepts

### Concept 1 (recommended, prototyped): Standards in Orbit

A slow, ink-on-paper globe of the world's countries rendered as points, not landmasses.
Each country is a node; the 54 with data carry their coordination-bloc colour, the rest are
faint ink. From the United States (the standard-setter) thin great-circle arcs propagate
outward to every NIST-bloc and EU node, the "NIST orbit", with quiet pulses travelling
along them. The three sovereign blocs (China, Russia, Vietnam) are ringed apart with small
concentric orbits and receive no arcs, which states the fragmentation thesis visually. The
globe turns slowly. The existing UI composes over it: wordmark, navigation, the one-line
tagline, the legend, the coordination/standards-role toggle, the country count, and a
"deadline horizon 2025 to 2035" readout. On enter or scroll the globe cross-dissolves into
the existing flat interactive map, so the hero and the instrument are one continuous object.

Why it wins: it is bold and unmistakably futuristic, yet every mark means something (node =
country, colour = bloc, arc = propagation, ring = sovereignty), so it honours the
one-role-for-colour discipline. It reuses the exact palette and the same geographic data.

### Concept 2 (conservative alternative): The Composing Atlas

No globe. The existing flat Natural Earth map draws itself: country borders stroke on as
fine ink lines, a faint graticule fades in, blocs fill in a short staggered sweep, then the
same setter-to-adopter arcs flow across the flat projection and settle. A single quiet
"deadline" line sweeps the 2025 to 2036 axis once. It then hands straight to the live map.
This is the lowest-risk option: it is literally the current SVG map plus a draw-on and an
arc layer, the most native integration, and the lightest to ship. It is less of a "wow"
than the globe but more faithful to "the map is the hero".

Recommendation: build Concept 1 as the landing hero with the cross-dissolve into Concept 2's
flat map, or ship Concept 2 alone if you want maximum restraint and minimum risk.

---

## 3. Colour palette

Straight from the Atlas tokens, so the hero cannot drift from the brand. No new colours.

Neutrals (the whole scene):

- Paper background `#F7F5F0`, surface white `#FFFFFF`
- Ink `#1A1A1A`, ink muted `#5C5C5C`, ink faint `#8A8A86`, hairline `#D8D6D0`
- Faint country nodes: ink at 18 to 22 percent alpha

Functional colour (only on coloured nodes, arcs, rings):

- NIST-led ecosystem `#2B4C7E`, EU coordinated roadmap `#5B54A8`, Sovereign bloc `#7A3B5E`,
  Engaged but unaligned `#6B7280`
- Arcs tinted faint NIST blue (`#2B4C7E` at ~17 percent) since they trace the NIST orbit
- Standards-role view (toggle): setter `#A8322A`, contextualiser `#B9762E`, taker `#4A6FA5`,
  sovereign developer `#7A3B5E`

Optional bold variant: an inverted "deep ink" hero (`#141312` background, paper-toned text,
the functional colours reading as quiet points of light). This is the most futuristic look
but a deliberate departure from the ink-on-paper rule, so use it only for a standalone
landing or social card, not the instrument itself.

---

## 4. Abstract shape vocabulary

- **Points (nodes).** Countries as dots, sized in two tiers: faint 1px ink for the field,
  2.5 to 3px bloc colour for the data set. The dot field is the "abstract world".
- **Great-circle arcs.** Thin geodesic curves from the setter outward; the propagation
  motif. Drawn front-hemisphere only on the globe.
- **Concentric rings.** Small orbits around sovereign nodes; the parallel-ecosystem motif.
- **Graticule.** A faint meridian and parallel grid for structure and the "instrument" feel.
- **The sphere.** A barely-there disc with a single hairline rim, so the globe has presence
  without shading or gradient.
- **A horizon or scan line** (optional, Concept 2): one thin sweep along the deadline axis.

Everything is thin-stroke, flat, no gradients, no glow. Texture comes from repetition of
points and lines, not from raster effects.

---

## 5. Movement

- **Compose-on (about 1.7s):** graticule and nodes fade and settle, arcs draw along their
  length, easing out. This is the "drawing the world" promise made good.
- **Steady state:** the globe rotates very slowly (about 4 degrees per second). Quiet pulses
  travel setter-to-adopter along the arcs, staggered. Sovereign rings hold.
- **Interaction:** the colour-by toggle recolours nodes and arcs live (coordination vs
  standards role); on the real site, hover and the slide-in profile carry over from the map.
- **Reduced motion:** no rotation, no pulses; the scene renders once as a composed still
  with arcs fully drawn. Meaning never depends on motion (colour, ring, and label carry it).

---

## 6. UI to include

Wordmark `QSC ATLAS` (grotesque, wide tracking); primary nav (Map, Countries, Analysis,
Documents, About); the one-line tagline in the serif reading face; the four-item posture
legend; the "colour by: coordination / standards role" toggle; the country count; and a
monospace "deadline horizon 2025 to 2035" readout. A small on-canvas "standard-setter"
caption pins to the US node when it faces the viewer.

---

## 7. The detailed prompt

### 7a. Build prompt (primary, for the actual site)

> Build a hero visual for the QSC Atlas called "Standards in Orbit", as a React island in
> the existing Astro app, reusing `d3-geo`, `topojson-client`, and the `process.ts` palette.
> Render a slow orthographic globe (`d3.geoOrthographic`) on the warm paper background
> `#F7F5F0`, drawn on an HTML canvas for performance, with an absolutely-positioned HTML/CSS
> UI layer over it. Plot every country as a point using the `world-atlas` centroids (or
> `world-countries` latlng): countries with data in their coordination-posture colour
> (NIST `#2B4C7E`, EU `#5B54A8`, sovereign `#7A3B5E`, engaged `#6B7280`), all others as ink
> at 20 percent. From the United States (standard-setter) draw thin great-circle arcs
> (`d3.geoInterpolate`, sampled to a LineString) to every NIST-bloc and EU node, tinted NIST
> blue at ~17 percent, with small pulses travelling along them; draw front-hemisphere
> segments only. Ring the sovereign nodes (China, Russia, Vietnam) with two faint concentric
> circles in `#7A3B5E` and give them no arcs. Add a faint graticule and a single hairline
> sphere rim. Compose the scene on over ~1.7s (fade and settle nodes, draw arcs), then rotate
> at ~4 deg/s with looping pulses. Overlay the UI: wordmark, nav, the serif tagline "The
> world is splitting into cryptographic blocs with different deadlines", the four-posture
> legend, a working coordination/standards-role colour toggle, the country count, and a
> monospace "deadline horizon 2025 to 2035" readout. Fonts: Schibsted Grotesk (UI),
> Newsreader (tagline), Spline Sans Mono (readouts). Under `prefers-reduced-motion: reduce`,
> render one static composed frame with no rotation or pulses. On enter or scroll, cross-fade
> the globe into the existing flat `geoNaturalEarth1` interactive map so the hero becomes the
> instrument. No gradients, no glow, no shadow; thin strokes throughout; colour only ever
> encodes a standards bloc or role.

### 7b. Generative prompt (for an image or video tool, mood and concept only)

> Minimalist editorial hero, ink on warm off-white paper (#F7F5F0). A slowly rotating
> wireframe globe made only of fine dots, one dot per country, with a faint meridian
> graticule and a single hairline rim, no shading, no gradient. A small number of countries
> glow in restrained flat colours (deep blue, indigo, aubergine, slate); thin geodesic arcs
> sweep from North America outward across the globe like quiet flight paths; a few countries
> in Asia are encircled by small concentric rings, standing apart. Clean precise instrument
> aesthetic, generous whitespace, a thin top bar with a wide-tracked "QSC ATLAS" wordmark and
> a one-line serif caption. Cartographic, scientific, classy, futuristic through restraint;
> not neon, not a startup landing page. Flat 2D, high contrast, monochrome with sparing
> functional colour. 16:9.

---

## 8. Technical feasibility (verified)

Verified against the actual stack, and proven by the rendered prototype.

- **Same stack, native fit.** The live map is already SVG `d3-geo` + topojson in a React
  island. Concept 2 is that map plus a `stroke-dashoffset` draw-on and an arc layer in the
  same SVG and projection, no new dependency. Concept 1 adds `d3.geoOrthographic` (already in
  `d3-geo`) on a canvas, then cross-fades to the existing `geoNaturalEarth1` SVG. Both reuse
  `process.ts` colours and the existing topojson.
- **Arcs are standard.** Great-circle arcs come from `d3.geoInterpolate` sampled into a
  LineString and passed to the projection, which does great-arc interpolation automatically.
  The prototype computes them with spherical linear interpolation, ~42 arcs at 56 samples,
  with no measurable cost.
- **Performance.** The prototype draws 250 nodes, 42 arcs, pulses, rings, and a graticule on
  a single canvas per frame; this is trivial for `requestAnimationFrame` and far lighter than
  a particle field or WebGL. Canvas is used for the many small marks; crisp UI stays in HTML.
- **Accessibility and reduced motion.** The opt-in pattern is used: under
  `prefers-reduced-motion` the scene renders once as a static composed still, no rotation, no
  pulses. The prototype implements this. Colour is never the only cue (ring, label, legend,
  and the profile text all carry meaning), matching the brief's colour-vision requirement.
  A visually-hidden summary describes the scene for screen readers.
- **Fonts and data.** The prototype loads the real brand faces from Google Fonts and uses
  real country positions from the local `world-countries` data, so it is not a mockup of the
  look, it is the look running.
- **What the prototype simplifies.** It plots country points, not drawn borders (no border
  topology was fetched), and the globe-to-flat-map cross-dissolve is described rather than
  shown. Both are routine to add in the app, where the topojson borders are already loaded.

Net: both concepts are feasible in the current stack with no new heavy dependency, and
Concept 1 is already running in `public/qsc-hero-prototype.html`.

---

## Sources

- SVG line drawing with stroke-dashoffset: CSS-Tricks, "How SVG Line Animation Works".
- Great-circle arcs in D3: `d3-geo` README (geoInterpolate); Observable, "World tour".
- Reduced motion: MDN, `prefers-reduced-motion`; 2025 motion-accessibility guidance (opt-in
  pattern, static fallback, duration token collapse).
- Dotted-globe motif: CSS Script, "3D Globe With Dotted World Map Using WebGL (Cobe)" and
  related halftone-map references (all dark or neon, hence the ink-on-paper divergence).
- Atlas internal: `docs/qsc-atlas-3-design-brief.md`, `src/styles/global.css`,
  `src/components/AtlasMap.tsx`, `src/lib/process.ts`.
