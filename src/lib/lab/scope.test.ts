import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BLANK_ANSWERS, WORKED_EXAMPLES, answersToSearch, articleFromParam, evaluateScope, nextExample, regimeArticleKey, reportsInFirstMonth, scopeCounts, searchToAnswers, statusLineKey, stepTimes } from './scope';
import type { Answers, ScopeRule, Sector } from './scope';

// ---- the engine, on small synthetic rules --------------------------------------------

const sectors: Sector[] = [
  { id: 'health', label: 'Health', annex: 'I', cer: true },
  { id: 'digital-infrastructure', label: 'Digital infrastructure', annex: 'I', cer: true },
  { id: 'manufacturing', label: 'Manufacturing', annex: 'II' },
];
const X = 'INSTR';
const rules: ScopeRule[] = [
  { id: 'a', instrument: X, when: { sectorAnnex: ['I', 'II'], sizeIn: ['medium', 'large'] }, outcome: 'appears-to-apply', reason: 'In an annex sector and not small', articleRef: 'Article 2(1)', priority: 10 },
  { id: 'b', instrument: X, when: { sectorAnnex: ['I', 'II'], sizeIn: ['micro', 'small'] }, outcome: 'applies-if-designated', reason: 'Small entities only if identified', articleRef: 'Article 2(2)', priority: 5 },
  { id: 'c', instrument: X, when: { sectorNone: true, answers: { alwaysInScopeService: ['no', 'unsure'] } }, outcome: 'does-not-appear-to-apply', reason: 'No listed sector or service', articleRef: 'Article 2', priority: 1 },
  { id: 'd', instrument: X, when: { answers: { alwaysInScopeService: ['yes'] } }, outcome: 'appears-to-apply', reason: 'Listed service, any size', articleRef: 'Article 2(2)(a)', priority: 20 },
];
const blank: Answers = { sector: null, size: null, established: null, q: {} };
const run = (a: Partial<Answers>) => evaluateScope(rules, { ...blank, ...a, q: { ...blank.q, ...(a.q ?? {}) } }, sectors, [X])[0];

describe('the scope engine', () => {
  it('says nothing before any answer', () => {
    expect(run({}).outcome).toBeNull();
  });
  it('lets the highest-priority matching rule decide, and cites it', () => {
    const r = run({ sector: 'health', size: 'medium', q: { alwaysInScopeService: 'yes' } });
    expect(r.outcome).toBe('appears-to-apply');
    expect(r.reasons[0]).toMatchObject({ articleRef: 'Article 2(2)(a)' });
  });
  it('covers each branch: small entities only if designated', () => {
    expect(run({ sector: 'manufacturing', size: 'small' }).outcome).toBe('applies-if-designated');
  });
  it('gives a negative only when every relevant answer is a firm no', () => {
    expect(run({ sector: 'none', q: { alwaysInScopeService: 'no' } }).outcome).toBe('does-not-appear-to-apply');
  });
  it('never turns "not sure" into "does not appear to apply"', () => {
    expect(run({ sector: 'none', q: { alwaysInScopeService: 'unsure' } }).outcome).toBe('may-apply-check');
  });
  it('falls back to "may apply; check" when no rule matches yet', () => {
    expect(run({ size: 'large' }).outcome).toBe('may-apply-check');
  });
});

describe('the scope line counts', () => {
  const fixture = [
    { status: 'in-force', lawText: 'policies and procedures regarding the use of cryptography and, where appropriate, encryption;' },
    { status: 'in-force', lawText: 'notify the personal data breach to the supervisory authority' },
    { status: 'applies-from', lawText: 'report any actively exploited vulnerability' },
  ];
  it('counts the obligations that are law, and those whose law text names cryptography', () => {
    expect(scopeCounts(fixture)).toEqual({ obligations: 3, crypto: 1 });
  });
  it('changes with a fixture obligation: one more that names encryption', () => {
    const changed = fixture.map((o, i) => (i === 1 ? { ...o, lawText: `${o.lawText}, unless the data was protected by encryption` } : o));
    expect(scopeCounts(changed)).toEqual({ obligations: 3, crypto: 2 });
  });
  it('changes with a fixture obligation: a proposal is not law and is not counted', () => {
    const changed = fixture.map((o, i) => (i === 0 ? { ...o, status: 'proposal' } : o));
    expect(scopeCounts(changed)).toEqual({ obligations: 2, crypto: 0 });
  });
  it('does not read "crypto-asset" as cryptography', () => {
    expect(scopeCounts([{ status: 'in-force', lawText: 'crypto-asset service providers' }])).toEqual({ obligations: 1, crypto: 0 });
  });
});

describe('the reporting deadlines', () => {
  const nis2 = {
    id: 'nis2', shortLabel: 'NIS2', celex: '32022L2555', recipient: 'CSIRT or competent authority',
    steps: [
      { id: 'ew', label: 'Early warning', within: 24, unit: 'hours' as const, from: 'becoming aware', fromKind: 'aware' as const },
      { id: 'n', label: 'Incident notification', within: 72, unit: 'hours' as const, from: 'becoming aware', fromKind: 'aware' as const },
      { id: 'f', label: 'Final report', within: 1, unit: 'months' as const, from: 'the notification', fromKind: 'notification' as const },
    ],
  };
  const dora = {
    id: 'dora', shortLabel: 'DORA', celex: '32022R2554', recipient: 'competent authority',
    steps: [{ id: 'i', label: 'Initial notification', within: 4, unit: 'hours' as const, from: 'classifying the incident as major', fromKind: 'classified' as const }],
  };
  it('counts a step from its own start event', () => {
    expect(stepTimes(nis2, { classifiedAfterHours: 2, fixAfterDays: 10 }).map((s) => s.dueHours)).toEqual([24, 72, 72 + 720]);
    expect(stepTimes(dora, { classifiedAfterHours: 2, fixAfterDays: 10 })[0]).toMatchObject({ startHours: 2, dueHours: 6 });
  });
  it('counts reports and kinds of authority due in the first month', () => {
    expect(reportsInFirstMonth([nis2, dora], { classifiedAfterHours: 2, fixAfterDays: 10 })).toEqual({ n: 3, m: 2 });
  });
});

describe('answers in the address bar', () => {
  it('round-trips every worked example', () => {
    for (const ex of WORKED_EXAMPLES) {
      const back = searchToAnswers(answersToSearch(ex.a));
      expect(back.a).toEqual(ex.a);
      expect(back.overlay).toBe(false);
      expect(back.sel).toBeNull();
    }
  });
  it('carries the overlay and the selected article', () => {
    const back = searchToAnswers(answersToSearch(BLANK_ANSWERS, true, '32022L2555/art23'));
    expect(back).toEqual({ a: BLANK_ANSWERS, overlay: true, sel: '32022L2555/art23' });
  });
  it('writes nothing for a blank form', () => {
    expect(answersToSearch(BLANK_ANSWERS)).toBe('');
  });
  it('opens an article by its key, or an act by its CELEX number at its first article in the map', () => {
    const arts = [
      { key: '32022R2554/art2', celex: '32022R2554' },
      { key: '32022R2554/art19', celex: '32022R2554' },
      { key: '32022L2555/art23', celex: '32022L2555' },
    ];
    expect(articleFromParam('32022L2555/art23', arts)).toBe('32022L2555/art23');
    expect(articleFromParam('32022R2554', arts)).toBe('32022R2554/art2');
    expect(articleFromParam('32022R2554/art99', arts)).toBeNull();
    expect(articleFromParam('32016R0679', arts)).toBeNull();
    expect(articleFromParam(null, arts)).toBeNull();
  });
  it('ignores unknown sizes, question codes and answer codes', () => {
    const back = searchToAnswers('?size=huge&q=fyzyaxgn');
    expect(back.a.size).toBeNull();
    expect(back.a.q).toEqual({ financialEntity: 'yes', personalDataController: 'no' });
  });
  it('turns the worked examples round a loop, one after another', () => {
    const n = WORKED_EXAMPLES.length;
    const seen = [0];
    for (let k = 1; k < n; k++) seen.push(nextExample(seen[k - 1], n));
    expect(seen).toEqual([...Array(n).keys()]);
    expect(nextExample(n - 1, n)).toBe(0);
    expect(nextExample(0, 0)).toBe(0);
  });
  it('matches the worked examples to the golden cases below', () => {
    expect(WORKED_EXAMPLES.map((e) => e.a.sector)).toEqual(['health', 'digital-infrastructure', 'banking', 'manufacturing', 'public-administration', 'energy']);
  });
});

describe('the article that sets a reporting deadline', () => {
  it('reads the first article number of the reference', () => {
    expect(regimeArticleKey({ celex: '32022R2554', articleRef: 'Article 19(4); Delegated Regulation (EU) 2025/301, Article 5(1)' })).toBe('32022R2554/art19');
    expect(regimeArticleKey({ celex: '32016R0679', articleRef: 'Article 33(1)' })).toBe('32016R0679/art33');
  });
  it('gives no key when no article is named', () => {
    expect(regimeArticleKey({ celex: 'X', articleRef: 'Annex I' })).toBeNull();
  });
});

describe('the line that says when an obligation applies', () => {
  const asOf = '2026-09-30';
  it('says "since" only for a date the law check has passed', () => {
    expect(statusLineKey({ status: 'in-force', appliesFrom: '2024-10-18' }, asOf, true)).toBe('statusAppliesSince');
    expect(statusLineKey({ status: 'in-force', appliesFrom: '2027-12-11' }, asOf, false)).toBe('statusAppliesFrom');
  });
  it('gives an in-force article with no single date its regime condition, when there is one', () => {
    expect(statusLineKey({ status: 'in-force', appliesFrom: null }, asOf, true)).toBe('statusInForceFor');
    expect(statusLineKey({ status: 'in-force', appliesFrom: null }, asOf, false)).toBe('statusInForce');
  });
  it('keeps a date that still needs a legal reading open', () => {
    expect(statusLineKey({ status: 'applies-from', appliesFrom: null }, asOf, true)).toBe('statusAppliesPending');
    expect(statusLineKey({ status: 'applies-from', appliesFrom: '2027-12-11' }, asOf, true)).toBe('statusAppliesFrom');
  });
  it('never words a proposal, or any other status, as law', () => {
    for (const status of ['proposal', 'adopted', 'repealed', 'withdrawn']) {
      expect(statusLineKey({ status, appliesFrom: '2025-01-17' }, asOf, true)).toBeNull();
    }
  });
});

// ---- the golden cases, once scope-rules.json exists ----------------------------------------
// Expected outcomes are the reference only after Swann has approved them (prompt 03, Step 5).

const RULES = join(process.cwd(), 'data/lab/rulebook/scope-rules.json');
const golden = existsSync(RULES) ? describe : describe.skip;
golden('golden cases (draft, awaiting approval)', () => {
  const file = existsSync(RULES) ? JSON.parse(readFileSync(RULES, 'utf8')) : { rules: [], sectors: [] };
  const flatSectors: Sector[] = file.sectors.flatMap((s: any) => [{ id: s.id, label: s.label, annex: s.annex, cer: s.cer }, ...s.subsectors.map((x: any) => ({ id: x.id, label: x.label, annex: s.annex, cer: s.cer }))]);
  const INSTRUMENTS = ['32022L2555', '32022L2557', '32022R2554', '32024R2847', '32016R0679', '32024R1689'];
  const outcomes = (a: Answers) => Object.fromEntries(evaluateScope(file.rules, a, flatSectors, INSTRUMENTS).map((r) => [r.instrument, r.outcome]));
  const no = { alwaysInScopeService: 'no', publicAdmin: 'no', productsDigital: 'no', financialEntity: 'no', cerDesignated: 'no', personalDataController: 'yes', highRiskAi: 'no' } as const;

  it('a medium-sized hospital in Belgium', () => {
    expect(outcomes({ sector: 'health', size: 'medium', established: 'BEL', q: { ...no, cerDesignated: 'unsure' } })).toMatchSnapshot();
  });
  it('a small DNS service provider in Ireland', () => {
    expect(outcomes({ sector: 'digital-infrastructure', size: 'small', established: 'IRL', q: { ...no, alwaysInScopeService: 'yes' } })).toMatchSnapshot();
  });
  it('a large bank in France', () => {
    expect(outcomes({ sector: 'banking', size: 'large', established: 'FRA', q: { ...no, financialEntity: 'yes' } })).toMatchSnapshot();
  });
  it('a micro-enterprise in Estonia that makes connected devices', () => {
    expect(outcomes({ sector: 'manufacturing', size: 'micro', established: 'EST', q: { ...no, productsDigital: 'yes' } })).toMatchSnapshot();
  });
  it('a regional public administration in Germany', () => {
    expect(outcomes({ sector: 'public-administration', size: 'large', established: 'DEU', q: { ...no, publicAdmin: 'yes' } })).toMatchSnapshot();
  });
  it('a large energy company in the Netherlands designated under CER', () => {
    expect(outcomes({ sector: 'energy', size: 'large', established: 'NLD', q: { ...no, cerDesignated: 'yes' } })).toMatchSnapshot();
  });
});
