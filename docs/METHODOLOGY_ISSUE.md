# QSC Atlas: the classification methodology issue, and how to resolve it

For the QSC methodology cowork. This note states the problem with how countries
were assigned a standards camp, and proposes a fix to confirm or replace. It does
not change any data.

## What the variable is

Each country carries a "Dominant Standards Process" (its camp), which is the map
colour and the headline analytical claim: NIST, EU, Sovereign, Mixed (ETSI and ISO
exist as categories but currently have no members). A country may also carry a
secondary label (France is EU + Sovereign, Germany EU + Mixed).

## The issue

The camp assignments were produced by four different, unstated rules, applied at
different times as the dataset grew from 6 to 54 coloured countries:

1. **By membership.** All 27 EU member states were set EU-aligned because they
   participate in the NIS Cooperation Group coordinated roadmap, regardless of
   national specifics.
2. **By own-scheme.** China, Russia and Vietnam were set Sovereign because they
   build their own national PQC algorithms (OSCCA/SM, GOST family, VN-PQSign).
   Saudi Arabia and UAE likewise on national encryption schemes.
3. **By de-facto default.** A large group (India, Norway, Israel, Turkey, Ukraine,
   Argentina, Chile, Bahrain, Brunei, Djibouti, Malaysia, Brazil, Thailand) were
   set NIST-aligned on the reasoning that a state engaging with PQC but not running
   its own scheme follows the NIST FIPS suite as the global default, even where its
   documents do not explicitly name NIST.
4. **By strict attestation.** The earliest countries were assigned a camp only
   where a document explicitly named it, and left grey otherwise.

The result is analytically uneven. A country can be "NIST" because its agency cites
FIPS 203, or because it does PQC and is not sovereign. Those are different claims.
For the thesis this is the most contestable part of the dataset, because the camp
variable carries the headline finding that the world is splitting into cryptographic
blocs.

## Secondary problems

- **"Engaged but uncommitted" is collapsed into NIST.** Many states have PQC
  activity but have not chosen a standard; defaulting them to NIST may overstate
  NIST's reach.
- **Confidence is uneven and was free text.** Several NIST-by-default calls are
  explicitly low-confidence (Turkey, Ukraine, Argentina, Brunei, Djibouti). Russia,
  Brazil and Thailand were drawn from candidate rather than fully vetted sources.
  (Confidence is now a structured field in ATLAS_COUNTRIES.)
- **ETSI and ISO are categories with no members.** Whether they are real camps for
  this dataset is unresolved.

## Proposed fix (to confirm or replace)

Define one explicit operational rubric and apply it uniformly, then tag every
country with the rule that produced its assignment and a confidence grade.

A starting rubric:

- **Sovereign** — the state develops or mandates its own national PQC algorithm
  scheme. (Tested first.)
- **EU-aligned** — an EU member state following the NIS Cooperation Group
  coordinated roadmap (membership plus roadmap participation).
- **NIST-aligned** — the state's official guidance adopts or recommends the NIST
  FIPS PQC suite (FIPS 203/204/205, ML-KEM/ML-DSA/SLH-DSA).
- **Mixed** — the state combines a national scheme or doctrine with NIST adoption.
- **ISO-aligned** — the state leads with ISO/IEC standards. Retain only if any
  country qualifies.
- A decision order and tie-breakers (for example Sovereign over EU over NIST where
  more than one applies; the EU-primary-plus-national-secondary pattern as the model
  for two-label countries).
- An explicit rule for engaged-but-uncommitted states.

Then re-classify every country against the single rubric, recording per country:
the rule applied, the evidence, and a confidence grade. The supporting fields
already exist (Classification Basis, Confidence, Verification Status).

## What the cowork should decide

1. The operational definition of each camp and the decision order.
2. How to treat engaged-but-uncommitted states: a distinct state, a NIST-by-default
   with an evidential bar, or grey.
3. Whether ETSI and ISO remain categories.
4. Whether the EU-primary-plus-national-secondary (two-label) pattern generalises to
   other blocs such as NATO.

Once the rubric is fixed, re-running the classification is a per-country pass over
data/profiles/*.json followed by `node scripts/update-profile.mjs data/profiles/*.json --deploy`.
