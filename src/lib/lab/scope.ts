// QSC Atlas Labs: the Rulebook's scope engine. Pure functions over declarative rules in
// data/lab/rulebook/scope-rules.json; components hold no rule logic. The legal time limits that
// follow an incident are "reporting deadlines" everywhere (spec 13): binding law sets them.
//
// A rule names an instrument, a condition and an outcome, cites the paragraph it comes from,
// and has a priority. For each instrument, the matching rule with the highest priority sets
// the outcome; every matching rule contributes its reason. "Not sure" can never produce
// "does not appear to apply": a rule whose condition relies on an answer of "not sure" is
// capped at "may apply; check", and an instrument with no matching rule is "may apply; check"
// once the visitor has started answering.

export type Outcome = 'appears-to-apply' | 'applies-if-designated' | 'may-apply-check' | 'does-not-appear-to-apply';
export type Tri = 'yes' | 'no' | 'unsure';

export const QUESTION_KEYS = ['alwaysInScopeService', 'publicAdmin', 'productsDigital', 'financialEntity', 'cerDesignated', 'personalDataController', 'highRiskAi'] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];

export interface Answers {
  sector: string | null; // a sector id from scope-rules.json, or "none"
  size: 'micro' | 'small' | 'medium' | 'large' | null;
  established: string | null; // ISO3 of an EU Member State, or "outside"
  q: Partial<Record<QuestionKey, Tri>>;
}

export interface RuleCondition {
  sectorAnnex?: ('I' | 'II')[]; // the sector is listed in one of these NIS2 annexes
  sectorIn?: string[]; // the sector is one of these ids
  sectorNone?: boolean; // the visitor chose "none of these"
  sizeIn?: Answers['size'][];
  established?: 'eu' | 'outside';
  answers?: Partial<Record<QuestionKey, Tri[]>>; // each listed question has one of these answers
}

export interface ScopeRule {
  id: string;
  instrument: string; // CELEX
  when: RuleCondition;
  outcome: Outcome;
  reason: string;
  articleRef: string;
  priority: number;
}

export interface Sector {
  id: string;
  label: string;
  annex: 'I' | 'II';
  cer?: boolean; // also a sector of the CER Directive's Annex
}

export interface InstrumentResult {
  instrument: string;
  outcome: Outcome | null; // null while nothing has been answered
  reasons: { text: string; articleRef: string; ruleId: string }[];
}

const RANK: Record<Outcome, number> = { 'does-not-appear-to-apply': 0, 'may-apply-check': 1, 'applies-if-designated': 2, 'appears-to-apply': 3 };

export function hasStarted(a: Answers): boolean {
  return a.sector !== null || a.size !== null || Object.values(a.q).some((v) => v !== undefined);
}

/** Whether a rule's condition holds, and whether it relied on a "not sure" answer. */
export function matches(rule: ScopeRule, a: Answers, sectors: Sector[]): { ok: boolean; unsure: boolean } {
  const w = rule.when;
  let unsure = false;
  if (w.sectorAnnex) {
    const s = sectors.find((x) => x.id === a.sector);
    if (!s || !w.sectorAnnex.includes(s.annex)) return { ok: false, unsure };
  }
  if (w.sectorIn && (!a.sector || !w.sectorIn.includes(a.sector))) return { ok: false, unsure };
  if (w.sectorNone !== undefined && (a.sector === 'none') !== w.sectorNone) return { ok: false, unsure };
  if (w.sizeIn && (!a.size || !w.sizeIn.includes(a.size))) return { ok: false, unsure };
  if (w.established) {
    if (!a.established) return { ok: false, unsure };
    if ((a.established === 'outside') !== (w.established === 'outside')) return { ok: false, unsure };
  }
  for (const [k, allowed] of Object.entries(w.answers ?? {}) as [QuestionKey, Tri[]][]) {
    const v = a.q[k];
    if (!v || !allowed.includes(v)) return { ok: false, unsure };
    if (v === 'unsure') unsure = true;
  }
  return { ok: true, unsure };
}

/** Evaluate every instrument. Instruments are returned in the order given. */
export function evaluateScope(rules: ScopeRule[], answers: Answers, sectors: Sector[], instruments: string[]): InstrumentResult[] {
  const started = hasStarted(answers);
  return instruments.map((instrument) => {
    if (!started) return { instrument, outcome: null, reasons: [] };
    const hits = rules
      .filter((r) => r.instrument === instrument)
      .map((r) => ({ r, m: matches(r, answers, sectors) }))
      .filter((h) => h.m.ok)
      .map((h) => ({ ...h.r, outcome: h.m.unsure && RANK[h.r.outcome] < RANK['may-apply-check'] ? ('may-apply-check' as Outcome) : h.r.outcome }))
      .sort((a, b) => b.priority - a.priority || RANK[b.outcome] - RANK[a.outcome]);
    if (!hits.length) {
      return { instrument, outcome: 'may-apply-check', reasons: [] };
    }
    const top = hits[0];
    // a negative outcome only stands when no other matching rule is more cautious
    const outcome = top.outcome === 'does-not-appear-to-apply' && hits.some((h) => h.outcome === 'may-apply-check') ? 'may-apply-check' : top.outcome;
    return {
      instrument,
      outcome,
      reasons: hits.filter((h) => h.outcome === outcome || h === top).map((h) => ({ text: h.reason, articleRef: h.articleRef, ruleId: h.id })),
    };
  });
}

// ---- the scope line ----------------------------------------------------------------------
// "EU instruments only. These rules govern cybersecurity in general; 1 of their 55 obligations
// mentions cryptography." Both numbers are counted here from the obligations the page holds.

/** The statuses that are law: only these reach the scope line, the panel and the export. */
export const LAW_STATUSES: ReadonlySet<string> = new Set(['in-force', 'applies-from']);

/** Words that name cryptography in the law's own text. "crypto-asset" is not one of them. */
export const CRYPTO_WORDS = /cryptograph|encrypt/i;

export interface ScopeCounts {
  obligations: number; // obligations that are law
  crypto: number; // of those, the ones whose law text names cryptography or encryption
}

/**
 * The counts of the scope line. An obligation is counted when its status is law; it mentions
 * cryptography when the law's own words for it (its verbatim excerpts and the text of the
 * paragraph it comes from, points included) name cryptography or encryption. The plain-language
 * summary is a draft of the Atlas's own and is never read here.
 */
export function scopeCounts(obligations: { status: string; lawText: string }[]): ScopeCounts {
  const law = obligations.filter((o) => LAW_STATUSES.has(o.status));
  return { obligations: law.length, crypto: law.filter((o) => CRYPTO_WORDS.test(o.lawText)).length };
}

// ---- the reporting deadlines -------------------------------------------------------------

export interface DeadlineStep {
  id: string;
  label: string;
  within: number;
  unit: 'hours' | 'days' | 'months';
  from: string;
  fromKind: 'aware' | 'classified' | 'notification' | 'intermediate' | 'fix';
}

export interface DeadlineRegime {
  id: string;
  shortLabel: string;
  celex: string;
  recipient: string;
  steps: DeadlineStep[];
}

export const HOURS = { hours: 1, days: 24, months: 24 * 30 } as const;

export interface DeadlineInputs {
  classifiedAfterHours: number; // DORA: when the incident is classified as major
  fixAfterDays: number; // CRA: when a corrective measure is available
}

/**
 * When each step falls due, in hours from becoming aware. A step counted from the
 * notification or from an intermediate report starts when that earlier step was due.
 */
export function stepTimes(regime: DeadlineRegime, inputs: DeadlineInputs): { step: DeadlineStep; startHours: number; dueHours: number }[] {
  const out: { step: DeadlineStep; startHours: number; dueHours: number }[] = [];
  let lastDue = 0;
  for (const step of regime.steps) {
    const span = step.within * HOURS[step.unit];
    let start = 0;
    if (step.fromKind === 'classified') start = inputs.classifiedAfterHours;
    else if (step.fromKind === 'fix') start = inputs.fixAfterDays * 24;
    else if (step.fromKind === 'notification' || step.fromKind === 'intermediate') start = lastDue;
    // DORA's initial notification: within 4 hours of classification, and no later than 24 hours
    // after becoming aware (the time-limit act says both), so the earlier of the two
    const due = step.fromKind === 'classified' ? Math.min(start + span, 24) : start + span;
    out.push({ step, startHours: start, dueHours: due });
    lastDue = due;
  }
  return out;
}

/** The map key of the article that sets a reporting deadline: "Article 19(4); Delegated Regulation ..." gives
    "CELEX/art19", the same key the article map and the proposals use. Null when no article is named. */
export function regimeArticleKey(r: { celex: string; articleRef: string }): string | null {
  const n = r.articleRef.match(/Article\s+(\d+)/)?.[1];
  return n ? `${r.celex}/art${n}` : null;
}

/** The copy key of the line that says when an obligation applies. Each lifecycle status has its
    own branch, and anything that is not law gets no line at all: a proposal is never worded as
    if it applied. "Since" is kept for a date the law check (lawAsOf) has already passed, and an
    in-force article with no single date takes the condition its reporting regime records. */
export function statusLineKey(
  o: { status: string; appliesFrom: string | null },
  lawAsOf: string | null,
  hasCondition: boolean,
): 'statusAppliesFrom' | 'statusAppliesPending' | 'statusAppliesSince' | 'statusInForceFor' | 'statusInForce' | null {
  switch (o.status) {
    case 'applies-from':
      return o.appliesFrom ? 'statusAppliesFrom' : 'statusAppliesPending';
    case 'in-force':
      if (o.appliesFrom) return lawAsOf && o.appliesFrom > lawAsOf ? 'statusAppliesFrom' : 'statusAppliesSince';
      return hasCondition ? 'statusInForceFor' : 'statusInForce';
    default:
      return null;
  }
}

/** The proposals that touch an article, by its map key. */
export function touchingProposals<P extends { touches: { articleKey: string }[] }>(proposals: P[], key: string | null): P[] {
  return key ? proposals.filter((p) => p.touches.some((t) => t.articleKey === key)) : [];
}

/** "One incident can start up to {n} reports to {m} kinds of authority in its first month", from
    the reporting regimes of the rules that appear to apply. */
export function reportsInFirstMonth(regimes: DeadlineRegime[], inputs: DeadlineInputs, horizonHours = 24 * 31) {
  let n = 0;
  const kinds = new Set<string>();
  for (const r of regimes) {
    const due = stepTimes(r, inputs).filter((s) => s.dueHours <= horizonHours);
    n += due.length;
    if (due.length) kinds.add(r.recipient);
  }
  return { n, m: kinds.size };
}

// ---- answers in the address bar ------------------------------------------------------------
// A set of answers travels in a short link: each question has a one-letter code and each answer
// a one-letter value, so "q=fyan" reads "financial entity: yes; listed service: no".

export const QCODE: Record<QuestionKey, string> = { alwaysInScopeService: 'a', publicAdmin: 'p', productsDigital: 'd', financialEntity: 'f', cerDesignated: 'c', personalDataController: 'g', highRiskAi: 'i' };
export const TCODE: Record<Tri, string> = { yes: 'y', no: 'n', unsure: 'u' };
const SIZES: NonNullable<Answers['size']>[] = ['micro', 'small', 'medium', 'large'];

export const BLANK_ANSWERS: Answers = { sector: null, size: null, established: null, q: {} };

/** The query string for a set of answers, the proposals overlay and a selected article; "" when empty. */
export function answersToSearch(a: Answers, overlay = false, sel: string | null = null): string {
  const q = new URLSearchParams();
  if (a.sector) q.set('sector', a.sector);
  if (a.size) q.set('size', a.size);
  if (a.established) q.set('in', a.established);
  const qs = QUESTION_KEYS.filter((k) => a.q[k]).map((k) => `${QCODE[k]}${TCODE[a.q[k]!]}`).join('');
  if (qs) q.set('q', qs);
  if (overlay) q.set('proposals', '1');
  if (sel) q.set('article', sel);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** The article that ?article= opens: an article key the map holds ("32022L2555/art23"), or the
    CELEX number of an act it holds ("32022R2554"), which opens that act's first article in the
    map's reading order. A profile line that names an act but no article links with the CELEX
    alone. Anything else opens nothing. */
export function articleFromParam(param: string | null, articles: { key: string; celex: string }[]): string | null {
  if (!param) return null;
  if (articles.some((x) => x.key === param)) return param;
  return articles.find((x) => x.celex === param)?.key ?? null;
}

/** The reverse of answersToSearch. Unknown sizes and unknown question or answer codes are ignored. */
export function searchToAnswers(search: string): { a: Answers; overlay: boolean; sel: string | null } {
  const q = new URLSearchParams(search);
  const size = q.get('size');
  const a: Answers = { sector: q.get('sector') || null, size: SIZES.find((s) => s === size) ?? null, established: q.get('in') || null, q: {} };
  const codes = q.get('q') ?? '';
  for (let i = 0; i + 1 < codes.length; i += 2) {
    const k = QUESTION_KEYS.find((x) => QCODE[x] === codes[i]);
    const t = (Object.keys(TCODE) as Tri[]).find((x) => TCODE[x] === codes[i + 1]);
    if (k && t) a.q[k] = t;
  }
  return { a, overlay: q.get('proposals') === '1', sel: q.get('article') || null };
}

// ---- the worked examples -------------------------------------------------------------------
// The six golden cases of scope.test.ts, offered on the page as links that take turns, one at a
// time, in a slot of fixed height. Every example answers Yes to the controller question and No to
// the questions its label does not name.

/** The example that follows example i of n, round the loop. */
export function nextExample(i: number, n: number): number {
  return n > 0 ? (((i + 1) % n) + n) % n : 0;
}

const NO_TO_ALL = { alwaysInScopeService: 'no', publicAdmin: 'no', productsDigital: 'no', financialEntity: 'no', cerDesignated: 'no', personalDataController: 'yes', highRiskAi: 'no' } as const;

export const WORKED_EXAMPLES: { id: string; a: Answers }[] = [
  { id: 'hospital', a: { sector: 'health', size: 'medium', established: 'BEL', q: { ...NO_TO_ALL, cerDesignated: 'unsure' } } },
  { id: 'dns', a: { sector: 'digital-infrastructure', size: 'small', established: 'IRL', q: { ...NO_TO_ALL, alwaysInScopeService: 'yes' } } },
  { id: 'bank', a: { sector: 'banking', size: 'large', established: 'FRA', q: { ...NO_TO_ALL, financialEntity: 'yes' } } },
  { id: 'devices', a: { sector: 'manufacturing', size: 'micro', established: 'EST', q: { ...NO_TO_ALL, productsDigital: 'yes' } } },
  { id: 'region', a: { sector: 'public-administration', size: 'large', established: 'DEU', q: { ...NO_TO_ALL, publicAdmin: 'yes' } } },
  { id: 'energy', a: { sector: 'energy', size: 'large', established: 'NLD', q: { ...NO_TO_ALL, cerDesignated: 'yes' } } },
];
