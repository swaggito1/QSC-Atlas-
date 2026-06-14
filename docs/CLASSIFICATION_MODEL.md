# How the QSC Atlas classifies countries

Website documentation. This is reader-facing copy, ready to publish as a methodology or
"how to read the map" page. It explains the two-part classification the Atlas uses, what
each category means, the stance it describes, and why the distinction matters.

---

## Two questions, not one

Every country in the Atlas is described on two dimensions, because two different things
are easy to confuse and matter for different reasons:

1. **Coordination posture**: which collective transition is the country part of? Whose
   roadmap, timeline, and rules is it working to?
2. **Standards role**: what is the country's relationship to the cryptographic standards
   themselves? Does it write them, adapt them, simply adopt them, or build its own?

These are not the same question. An EU member state coordinates through the EU roadmap,
yet the algorithms it actually deploys are the American NIST standards, because there is
no European alternative. Describe it with one label and you have to drop half the truth.
The Atlas keeps both, so the map can show the bloc a country belongs to without implying
it runs different cryptography.

A short way to hold the distinction: coordination posture is the *club*; standards role
is the *technology*.

---

## Dimension one: coordination posture

Which collective transition the country belongs to. On the map, this is the colour.

### EU coordinated roadmap

The country follows the European Union's synchronised transition: the NIS Cooperation
Group's Coordinated Implementation Roadmap, with its 2026, 2030, and 2035 milestones,
sitting on top of NIS2 and DORA. **Stance:** migrate in step with the other member
states, on a shared timeline, under shared regulation. **Why it matters:** this is a
coordination commitment, not a separate set of algorithms. Reading it as a rival
standards bloc is the most common mistake about the European position, and the reason the
Atlas separates the two dimensions. **Examples:** France, Germany, the Netherlands, and
the other 24 EU members.

### NIST-led ecosystem

The country works to the standards and cadence set by the United States' National
Institute of Standards and Technology: the FIPS 203, 204, and 205 algorithms, often with
timelines echoing CNSA 2.0. **Stance:** treat the NIST suite as the global baseline and
plan the national transition around it. **Why it matters:** this is the largest group by
far, which is the single most important fact about the landscape. Most of the world is
converging on one baseline. **Examples:** the United States, United Kingdom, Canada,
Australia, Singapore, India, Saudi Arabia.

### Sovereign bloc

The country builds and mandates its own national algorithms and runs its transition
independently of NIST, not merely alongside it. **Stance:** cryptographic independence as
a matter of national security and technological self-reliance. **Why it matters:** this
is where the global baseline actually fractures. A sovereign bloc with enough market
scale can sustain a parallel ecosystem, which raises real questions of interoperability
and market access. **Examples:** China (the SM-series and the NGCC programme), Russia
(the GOST suite and indigenous post-quantum candidates).

### Engaged but unaligned

The country is visibly working on the quantum-safe transition, through a conference, a
research programme, an agency statement, but has not committed to a bloc, a standard, or a
timeline. **Stance:** aware and active, not yet decided. **Why it matters:** this is the
honest home for countries that earlier versions of the data quietly counted as
NIST-aligned by default. Keeping the category separate stops the Atlas from overstating
how far any one bloc reaches. **Examples:** Turkey, Ukraine, and several states with thin
public records.

A country with no traceable institutional source on the quantum-safe transition is left
uncoloured ("no data"), which is different from engaged but unaligned: one has nothing on
the record, the other is active but uncommitted.

---

## Dimension two: standards role

The country's relationship to the algorithms themselves. On a country profile, this is a
labelled badge; the map can also be recoloured by it.

### Standard-setter

The country writes the standards the rest of the world adopts. **Stance:** define the
baseline. **Why it matters:** there is effectively one setter for post-quantum
cryptography today, the United States through NIST. Naming the role makes the central
power asymmetry of the field visible: one country writes the rules, almost everyone else
receives them. **Example:** the United States.

### Standard-contextualiser

The country accepts the setter's algorithms as the baseline but adds national
requirements on top: mandatory hybrid deployment, larger key sizes, independent
certification, or a national evaluation process. **Stance:** adopt, but on our own terms.
**Why it matters:** this is the most sophisticated common posture, and it is what most
capable states actually do rather than either passively taking or fully forking the
baseline. **Examples:** France (ANSSI hybridisation and certification), Germany (the BSI
technical guidelines), Japan (the CRYPTREC evaluation process), South Korea (a national
competition producing its own NIST-compatible algorithms).

### Standard-taker

The country adopts the setter's algorithms broadly as published, without a substantial
national overlay. **Stance:** implement the baseline and get on with migrating. **Why it
matters:** it distinguishes the majority that follow from the few that shape. Most of the
world, including most EU members, sits here. **Examples:** many EU member states, Saudi
Arabia, the United Arab Emirates.

### Sovereign developer

The country designs and standardises its own post-quantum algorithms. **Stance:** build,
do not borrow. **Why it matters:** this is the only role that genuinely diverges from the
single baseline, so it marks the real edge of fragmentation. **Examples:** China and
Russia (full independence); South Korea sits on the boundary, running its own national
competition while keeping its algorithms interoperable with the NIST suite.

---

## Putting the two together

The point of two dimensions is that the interesting cases differ on one while sharing the
other. A few worked examples:

| Country | Coordination posture | Standards role | What the pair tells you |
|---|---|---|---|
| United States | NIST-led ecosystem | Standard-setter | Writes the baseline the others use. |
| France | EU coordinated roadmap | Standard-contextualiser | EU timeline and rules; NIST algorithms with national hybridisation on top. |
| Netherlands | EU coordinated roadmap | Standard-taker | Same EU club as France, but adopts the baseline with less national overlay. |
| South Korea | NIST-led ecosystem | Standard-contextualiser | Runs its own national competition, yet keeps its algorithms interoperable with NIST. |
| China | Sovereign bloc | Sovereign developer | Independent on both counts: own club, own algorithms. |
| Saudi Arabia | NIST-led ecosystem | Standard-taker | A national standard and policy, but it profiles the NIST baseline rather than replacing it. |
| Turkey | Engaged but unaligned | (not yet declared) | Active on the transition, no bloc or standard chosen. |

France and the Netherlands share a posture but differ in role. South Korea and China
both build their own algorithms, but Korea stays inside the NIST-interoperable world while
China leaves it. None of that is expressible with a single label.

---

## Why this matters

The classification is the headline analytical claim of the Atlas, so getting its shape
right changes what the map can honestly say.

**It separates the club from the technology.** Without the split, "EU-aligned" reads like
a competing standards camp. It is not. The EU is a coordination bloc running the same
algorithms as everyone else in the NIST baseline. The two-part model lets the map show
the European bloc without inventing a European cryptography that does not exist.

**It makes the real power structure visible.** One country sets the standard; most of the
world takes or adapts it. That asymmetry is the central fact of the post-quantum
transition, and a single "NIST" colour hides it by painting the author and its adopters
the same shade.

**It isolates genuine divergence.** Only sovereign developers actually fork the baseline.
By giving that its own category, the Atlas can point precisely at where the global
standard is at risk of fragmenting, instead of blurring it into a general "Sovereign"
bucket that has, in the past, swept in countries with national *policies* but no national
*algorithms*.

**It tells the truth about uncertainty.** "Engaged but unaligned" stops the Atlas from
counting undecided countries as committed. That keeps the size of each bloc honest, which
matters most for the largest bloc, where a default-to-NIST habit otherwise overstates
reach.

**It answers the two questions a reader actually has.** A policymaker or security lead
wants to know two separate things: whose timeline and rules apply to me (coordination),
and whose algorithms will my systems run and interoperate with (role). One field cannot
answer both. Two can.

---

## How to read the map

- **Colour** shows coordination posture: the bloc a country is migrating with.
- **The role badge** on each country profile shows its standards role: setter,
  contextualiser, taker, or sovereign developer. The map can be recoloured by role to see
  the setter-and-takers picture directly.
- **Faint grey** is no data: no institutional source found yet. It is not the same as
  engaged but unaligned, which is an active but uncommitted country.
- **Confidence** is shown alongside every classification and drives how strongly a country
  is coloured, so a low-confidence call looks tentative rather than settled. Each profile
  links to the institutional documents it is built from, so any classification can be
  checked against its sources.
