import { describe, expect, it } from 'vitest';
import {
  actionsFor,
  decodeState,
  earliestTarget,
  elementHref,
  encodeState,
  firstOfGroup,
  firstUnanswered,
  groupSummaries,
  milestoneDue,
  milestoneOrder,
  milestoneShort,
  milestoneWhen,
  nextSteps,
  positionIn,
  questionsFor,
  readLanding,
  readRole,
  targetLine,
  toCsv,
  withSource,
} from './readiness';
import type { Answer, RdState } from './readiness';
import {
  DEFAULT_SOURCES,
  ELEMENT_RULES,
  ENTRY_ACTION,
  checkLinks,
  checkedSentence,
  countWord,
  islandCopy,
  islandData,
  islandProvenance,
  loadReadiness,
  readReadiness,
  verifiedSpan,
} from './readiness-data';
import { getProfile } from './atlas';
import { allPrivateRoot } from './registry-fixture';
import { scanString } from '../../../labs/tools/style-scan.mjs'; // the house-style scanner, typed from its JS (allowJs)

const file = readReadiness();
const data = loadReadiness({}, new Date('2026-10-01T12:00:00Z'));
const known = { frameworks: data.frameworks.map((f) => f.id), actions: data.actions.map((a) => a.id) };

describe('the data', () => {
  it('points every dueBy at an existing framework and milestone', () => {
    const milestones = new Map(file.frameworks.map((f) => [f.id, new Set(f.milestones.map((m) => m.id))]));
    for (const a of file.actions) {
      for (const d of a.dueBy) {
        expect(milestones.has(d.framework), `${a.id} names framework ${d.framework}`).toBe(true);
        expect(milestones.get(d.framework)!.has(d.milestone), `${a.id} names milestone ${d.milestone}`).toBe(true);
      }
    }
  });

  it('gives every dated action at least one milestone of its own source', () => {
    for (const a of file.actions) {
      if (a.dueBy.length) expect(a.dueBy.some((d) => d.framework === a.source), a.id).toBe(true);
    }
  });

  it('keeps sources, domains and stances pointing at records that exist', () => {
    const fws = new Set(file.frameworks.map((f) => f.id));
    const doms = new Set(file.domains.map((d) => d.id));
    for (const a of file.actions) {
      expect(fws.has(a.source), a.id).toBe(true);
      expect(doms.has(a.domain), a.id).toBe(true);
    }
    for (const p of file.positions) for (const s of p.stances) expect(fws.has(s.framework)).toBe(true);
    if (file.entry) expect(fws.has(file.entry.source)).toBe(true);
  });

  it('only holds published guidance or soft law, so every date is a target', () => {
    for (const f of file.frameworks) {
      expect(f.status).toBe('published');
      expect(['guidance', 'soft-law']).toContain(f.bindingness);
    }
  });

  it('takes each issuer posture from the Atlas profile of its jurisdiction', () => {
    for (const f of file.frameworks) {
      expect(f.appliesToPosture, f.id).toBe(getProfile(f.jurisdiction)?.posture?.key ?? null);
    }
  });

  it('dates each source document from its own printed date, and leaves the undated one undated', () => {
    const eu = data.frameworks.find((f) => f.id === 'eu-roadmap')!;
    expect(eu.published).toBe('2025-06-11');
    expect(data.frameworks.find((f) => f.id === 'anssi-faq')!.published).toBeNull();
    for (const d of file.documents) {
      expect(d.provenance.some((p) => p.url === d.url), d.url).toBe(true);
    }
    const undatedRefs = data.sources.filter((s) => !s.date).map((s) => s.url);
    expect(undatedRefs).toEqual(['https://cyber.gouv.fr/enjeux-technologiques/cryptographie-post-quantique/faq-pqc/']);
  });

  it('quotes each entry outcome from its own excerpt, with its own locator', () => {
    const entry = file.entry!;
    expect(entry.outcome.yesProvenance[0].locator).toMatch(/printed p\. 20/);
    expect(entry.outcome.noProvenance[0].locator).toMatch(/Figure 2\.2/);
    expect(entry.outcome.noProvenance[0].excerpt.endsWith('.')).toBe(false);
  });

  it('keeps every visitor-facing string in readiness.json clear of house-style HARD findings', () => {
    const strings: [string, string][] = [];
    for (const f of file.frameworks) {
      strings.push([f.id, f.audience]);
      for (const m of f.milestones) strings.push([m.id, m.label]);
    }
    for (const d of file.domains) strings.push([d.id, d.label], [d.id, d.description]);
    for (const a of file.actions) {
      strings.push([a.id, a.label], [a.id, a.description]);
      if (a.audienceNote) strings.push([a.id, a.audienceNote]);
    }
    for (const p of file.positions) {
      strings.push([p.id, p.topic]);
      for (const s of p.stances) strings.push([s.framework, s.summary]);
    }
    if (file.entry) {
      strings.push(['entry', file.entry.intro], ['entry', file.entry.outcome.yes], ['entry', file.entry.outcome.no]);
      for (const q of file.entry.questions) strings.push([q.id, q.text]);
    }
    for (const [id, s] of strings) {
      const hard = scanString(s).filter((x: { level: string }) => x.level === 'HARD');
      expect(hard, `${id}: ${s}`).toEqual([]);
    }
  });

  it('opens on the EU roadmap and the NCSC timelines', () => {
    expect(data.defaults).toEqual(DEFAULT_SOURCES);
    expect(DEFAULT_SOURCES.every((id) => known.frameworks.includes(id))).toBe(true);
  });
});

describe('the questions', () => {
  const qs = questionsFor(data.actions, data.domains, DEFAULT_SOURCES);

  it('asks one question per action of the chosen guides, group by group in the order of the groups', () => {
    expect(qs.map((q) => q.id).sort()).toEqual(actionsFor(data.actions, DEFAULT_SOURCES).map((a) => a.id).sort());
    const order = data.domains.map((d) => d.id);
    const seen = qs.map((q) => order.indexOf(q.domain));
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    // inside a group, the order of the data
    for (const d of data.domains) {
      const inGroup = qs.filter((q) => q.domain === d.id).map((q) => q.id);
      expect(inGroup).toEqual(data.actions.filter((a) => a.domain === d.id && DEFAULT_SOURCES.includes(a.source)).map((a) => a.id));
    }
  });

  it('with the two default guides asks 3, 4, 7, 2, 5 and 2 questions, computed from the data', () => {
    const counts = data.domains.map((d) => qs.filter((q) => q.domain === d.id).length);
    const fromFile = file.domains.map((d) => file.actions.filter((a) => a.domain === d.id && DEFAULT_SOURCES.includes(a.source)).length);
    expect(counts).toEqual(fromFile);
    expect(counts).toEqual([3, 4, 7, 2, 5, 2]);
  });

  it('says where a question sits in its group, for the quiet progress line', () => {
    const third = qs.findIndex((q) => q.domain === 'discovery') + 2;
    expect(positionIn(qs, third)).toEqual({ group: 'discovery', n: 3, of: 4 });
    expect(positionIn(qs, 0)).toEqual({ group: 'governance', n: 1, of: 3 });
    expect(positionIn(qs, qs.length)).toBeNull();
  });

  it('finds the first question of a group, and none for a group no chosen guide speaks to', () => {
    expect(firstOfGroup(qs, 'suppliers')?.id).toBe('eu-suppliers');
    expect(firstOfGroup(questionsFor(data.actions, data.domains, ['ncsc-next-steps']), 'governance')).toBeNull();
  });

  it('opens a returning visitor on the first question still unanswered', () => {
    expect(firstUnanswered(qs, {})?.id).toBe(qs[0].id);
    expect(firstUnanswered(qs, { [qs[0].id]: 'done', [qs[1].id]: 'not-applicable' })?.id).toBe(qs[2].id);
    const all = Object.fromEntries(qs.map((q) => [q.id, 'done' as Answer]));
    expect(firstUnanswered(qs, all)).toBeNull();
  });
});

describe('the address', () => {
  it('round-trips guides, answers and the role', () => {
    const state: RdState = {
      chosen: ['eu-roadmap', 'ca-roadmap'],
      answers: { 'eu-inventory': 'done', 'eu-plan': 'in-progress', 'ca-committee': 'not-started', 'eu-board-risk': 'not-applicable' },
      role: 'public-administration',
    };
    const hash = '#' + encodeState(state);
    expect(hash).toBe('#f=eu-roadmap,ca-roadmap&d=eu-inventory&u=eu-plan&n=ca-committee&x=eu-board-risk&r=p');
    expect(decodeState(hash, known, DEFAULT_SOURCES)).toEqual(state);
  });

  it('keeps an empty choice, no answers and no role', () => {
    const state: RdState = { chosen: [], answers: {}, role: null };
    expect(decodeState(encodeState(state), known, DEFAULT_SOURCES)).toEqual(state);
  });

  it('drops ids it does not know and falls back to the defaults without f=', () => {
    expect(decodeState('#f=eu-roadmap,nowhere&d=eu-inventory,ghost&r=z', known, DEFAULT_SOURCES)).toEqual({
      chosen: ['eu-roadmap'],
      answers: { 'eu-inventory': 'done' },
      role: null,
    });
    expect(decodeState('#d=eu-inventory', known, DEFAULT_SOURCES)?.chosen).toEqual(DEFAULT_SOURCES);
    expect(decodeState('#r=o', known, DEFAULT_SOURCES)).toEqual({ chosen: DEFAULT_SOURCES, answers: {}, role: 'organisation' });
    expect(decodeState('', known, DEFAULT_SOURCES)).toBeNull();
    expect(decodeState('#rd-eu-inventory', known, DEFAULT_SOURCES)).toBeNull();
  });

  it('survives a broken percent escape and keeps the pairs it can read', () => {
    expect(() => decodeState('#f=%', known, DEFAULT_SOURCES)).not.toThrow();
    expect(decodeState('#f=%', known, DEFAULT_SOURCES)).toEqual({ chosen: DEFAULT_SOURCES, answers: {}, role: null });
    expect(decodeState('#f=eu-roadmap&d=eu-inventory%2', known, DEFAULT_SOURCES)).toEqual({ chosen: ['eu-roadmap'], answers: {}, role: null });
    expect(decodeState('#f=eu-roadmap&d=eu-inventory&u=%E0%A4%A', known, DEFAULT_SOURCES)?.answers).toEqual({ 'eu-inventory': 'done' });
  });
});

describe('an old share link', () => {
  it('restores the guides and reads "under way" as in progress, leaving the old "not sure" unanswered', () => {
    // the fragment of the Check before October 2026: f= the guides, then one list per mark
    const old = '#f=eu-roadmap,ncsc-timelines&d=eu-inventory,ncsc-plan&u=eu-board-risk&n=ncsc-budget&q=eu-scope';
    expect(decodeState(old, known, DEFAULT_SOURCES)).toEqual({
      chosen: ['eu-roadmap', 'ncsc-timelines'],
      answers: { 'eu-inventory': 'done', 'ncsc-plan': 'done', 'eu-board-risk': 'in-progress', 'ncsc-budget': 'not-started' },
      role: null,
    });
    expect('#' + encodeState(decodeState(old, known, DEFAULT_SOURCES)!)).toBe('#f=eu-roadmap,ncsc-timelines&d=eu-inventory,ncsc-plan&u=eu-board-risk&n=ncsc-budget');
  });

  it('opens a guide page\'s "Mark these actions" link with that guide alone', () => {
    expect(decodeState('#f=ca-roadmap', known, DEFAULT_SOURCES)).toEqual({ chosen: ['ca-roadmap'], answers: {}, role: null });
  });
});

describe('targets', () => {
  const action = (id: string) => data.actions.find((a) => a.id === id)!;

  it("gives the action's own target and its guide's bindingness, without naming the guide again", () => {
    expect(targetLine(action('eu-inventory'), data.frameworks, DEFAULT_SOURCES, data.copy)).toBe('target end 2026 · soft law');
    expect(targetLine(action('ca-disable-legacy'), data.frameworks, ['ca-roadmap'], data.copy)).toBe('target end 2031 and end 2035 · guidance');
  });

  it('names another chosen source only when its milestone names the same step', () => {
    expect(targetLine(action('ncsc-priority'), data.frameworks, ['ncsc-timelines', 'ca-roadmap'], data.copy)).toBe('target 2031 · guidance · also end 2031 in the Canadian roadmap');
    expect(targetLine(action('ncsc-priority'), data.frameworks, ['ncsc-timelines'], data.copy)).toBe('target 2031 · guidance');
  });

  it('says "target" and the bindingness on every dated line, so a date read alone never passes for a deadline', () => {
    const all = data.frameworks.map((f) => f.id);
    for (const a of data.actions.filter((x) => x.dueBy.length)) {
      const own = data.frameworks.find((f) => f.id === a.source)!;
      const line = targetLine(a, data.frameworks, all, data.copy);
      expect(line, a.id).toMatch(/^(target |every year from )/);
      expect(line.split(' · '), a.id).toContain(own.bindingnessLabel);
    }
  });

  it('writes a yearly deliverable as yearly, and an undated action as having no target', () => {
    expect(targetLine(action('ca-report'), data.frameworks, ['ca-roadmap'], data.copy)).toBe('every year from Apr 2026 · guidance');
    expect(milestoneDue({ year: 2026, month: 4, recurs: 'yearly' })).toBe('every year from Apr 2026');
    expect(targetLine(action('ncsc-budget'), data.frameworks, DEFAULT_SOURCES, data.copy)).toBe(data.copy.targetNone);
  });

  it('never says "due" or "deadline" in a target line', () => {
    for (const a of data.actions) {
      const line = targetLine(a, data.frameworks, data.frameworks.map((f) => f.id), data.copy);
      expect(line, a.id).not.toMatch(/\bdue\b|deadline/i);
    }
  });

  it('takes the earliest target among the chosen guides, the own guide first on a tie', () => {
    const complete = action('ncsc-complete');
    // the NCSC's 2035, with no month, counts from January and so comes before the end of 2035
    expect(earliestTarget(complete, data.frameworks, ['ncsc-timelines', 'eu-roadmap', 'ca-roadmap'])?.milestone.id).toBe('ncsc-2035');
    expect(earliestTarget(complete, data.frameworks, ['eu-roadmap', 'ca-roadmap'])?.framework.id).toBe('eu-roadmap');
    expect(earliestTarget(action('ncsc-budget'), data.frameworks, DEFAULT_SOURCES)).toBeNull();
    expect(earliestTarget(action('ca-disable-legacy'), data.frameworks, ['ca-roadmap'])?.milestone.id).toBe('ca-2031');
  });
});

describe('the assessment', () => {
  const qs = questionsFor(data.actions, data.domains, DEFAULT_SOURCES);

  it('names up to three steps marked in progress or not started, the earliest target first, undated last', () => {
    const answers: Record<string, Answer> = {
      'ncsc-budget': 'not-started', // no target date
      'ncsc-complete': 'in-progress', // 2035
      'eu-inventory': 'not-started', // end 2026
      'ncsc-discovery': 'in-progress', // 2028
      'eu-plan': 'done',
      'eu-hybrid': 'not-applicable',
    };
    const steps = nextSteps(qs, answers, data.frameworks, DEFAULT_SOURCES);
    expect(steps.map((s) => s.action.id)).toEqual(['eu-inventory', 'ncsc-discovery', 'ncsc-complete']);
    expect(steps[0].target?.milestone.id).toBe('eu-2026');
    expect(nextSteps(qs, answers, data.frameworks, DEFAULT_SOURCES, 5).map((s) => s.action.id).at(-1)).toBe('ncsc-budget');
  });

  it('puts what is in progress before what has not started on the same target, and ignores done, not applicable and unanswered', () => {
    const steps = nextSteps(qs, { 'eu-inventory': 'not-started', 'eu-dependencies': 'in-progress', 'eu-plan': 'done' }, data.frameworks, DEFAULT_SOURCES);
    expect(steps.map((s) => s.action.id)).toEqual(['eu-dependencies', 'eu-inventory']);
    expect(nextSteps(qs, { 'eu-plan': 'done', 'eu-hybrid': 'not-applicable' }, data.frameworks, DEFAULT_SOURCES)).toEqual([]);
    expect(nextSteps(qs, {}, data.frameworks, DEFAULT_SOURCES)).toEqual([]);
  });

  it("sorts each group's questions by the visitor's own answer, and counts nothing across groups", () => {
    const sums = groupSummaries(qs, { 'eu-inventory': 'done', 'ncsc-discovery': 'in-progress' }, data.domains);
    expect(sums.map((g) => g.id)).toEqual(data.domains.map((d) => d.id));
    const disc = sums.find((g) => g.id === 'discovery')!;
    expect(disc.byAnswer.done.map((q) => q.id)).toEqual(['eu-inventory']);
    expect(disc.byAnswer['in-progress'].map((q) => q.id)).toEqual(['ncsc-discovery']);
    expect(disc.unanswered).toHaveLength(2);
    expect(disc.questions).toHaveLength(4);
    // a group none of the chosen guides speaks to is left out
    expect(groupSummaries(questionsFor(data.actions, data.domains, ['ncsc-next-steps']), {}, data.domains).map((g) => g.id)).toEqual(['suppliers']);
  });
});

describe('dates', () => {
  it('orders a year with no month from its first month', () => {
    expect(milestoneOrder({ year: 2030, month: null })).toBeLessThan(milestoneOrder({ year: 2030, month: 12 }));
  });
  it('labels milestones as the sources word them', () => {
    expect(milestoneShort({ year: 2026, month: 12 })).toBe('end 2026');
    expect(milestoneShort({ year: 2026, month: 4 })).toBe('Apr 2026');
    expect(milestoneShort({ year: 2028, month: null })).toBe('2028');
    expect(milestoneWhen({ year: 2026, month: 4 })).toBe('in April 2026');
  });
});

describe('what the page shows', () => {
  it('escapes CSV cells', () => {
    const csv = toCsv([['a', 'b, c', 'say "hi"']]);
    expect(csv).toBe('﻿a,"b, c","say ""hi"""\r\n');
  });

  it('carries no score or percentage in its copy', () => {
    const text = JSON.stringify(data.copy).toLowerCase();
    expect(text).not.toMatch(/your score|per cent|%|ranking of|ranked/);
  });
});

describe('where a link opens', () => {
  const landingKnown = {
    domains: data.domains.map((d) => d.id),
    actions: data.actions.map((a) => ({ id: a.id, source: a.source })),
    entryAction: ENTRY_ACTION,
  };

  it('reads ?action=, ?theme= (or ?group=) and ?start=entry, the action first', () => {
    expect(readLanding('?theme=suppliers', landingKnown)).toEqual({ kind: 'group', id: 'suppliers', source: null });
    expect(readLanding('?group=planning', landingKnown)).toEqual({ kind: 'group', id: 'planning', source: null });
    expect(readLanding('?action=eu-scope', landingKnown)).toEqual({ kind: 'action', id: 'eu-scope', source: 'eu-roadmap' });
    expect(readLanding('?start=entry', landingKnown)).toEqual({ kind: 'action', id: 'nl-persona', source: 'nl-handbook' });
    expect(readLanding('?theme=suppliers&action=ca-procurement', landingKnown)?.id).toBe('ca-procurement');
  });

  it('ignores what it does not know, and an empty query', () => {
    expect(readLanding('', landingKnown)).toBeNull();
    expect(readLanding('?theme=nowhere', landingKnown)).toBeNull();
    expect(readLanding('?action=ghost&theme=planning', landingKnown)).toEqual({ kind: 'group', id: 'planning', source: null });
    expect(readLanding('?start=other', landingKnown)).toBeNull();
    expect(readLanding('?start=entry', { ...landingKnown, entryAction: null })).toBeNull();
  });

  it("reads whom the visitor answers for from ?as=, the hub's two ways in", () => {
    expect(readRole('?as=organisation')).toBe('organisation');
    expect(readRole('?as=public-administration&theme=planning')).toBe('public-administration');
    expect(readRole('?as=minister')).toBeNull();
    expect(readRole('')).toBeNull();
  });

  it('opens ?start=entry on a question that exists, from the Dutch Handbook', () => {
    expect(data.actions.find((a) => a.id === ENTRY_ACTION)?.source).toBe(file.entry?.source);
  });

  it("adds the landing's guide to the choice in data order, and never removes one", () => {
    const order = data.frameworks.map((f) => f.id);
    expect(withSource(DEFAULT_SOURCES, 'ca-roadmap', order)).toEqual(['eu-roadmap', 'ncsc-timelines', 'ca-roadmap']);
    expect(withSource(['nl-handbook'], 'eu-roadmap', order)).toEqual(['eu-roadmap', 'nl-handbook']);
    expect(withSource(DEFAULT_SOURCES, 'eu-roadmap', order)).toBe(DEFAULT_SOURCES);
    expect(withSource(DEFAULT_SOURCES, null, order)).toBe(DEFAULT_SOURCES);
    expect(withSource(DEFAULT_SOURCES, 'ghost', order)).toBe(DEFAULT_SOURCES);
  });

  it('keeps the query apart from the hash: a landing never decodes as answers, nor answers as a landing', () => {
    expect(decodeState('#theme=suppliers', known, DEFAULT_SOURCES)).toBeNull();
    expect(readLanding('?f=eu-roadmap&d=eu-inventory', landingKnown)).toBeNull();
  });
});

describe('the links each question carries', () => {
  const preview = { env: {} as Record<string, string | undefined> };
  // a production build in which only the Check is public: every element is hidden
  // the Readiness Check alone, forced public on the real registry with every tool private again
  const checkOnly = { root: allPrivateRoot(), env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'readiness' } as Record<string, string | undefined> };
  const supplierActions = data.actions.filter((a) => a.domain === 'suppliers').map((a) => a.id);

  it('maps every rule to actions that exist, with a label in the copy, and none to EU rules', () => {
    const labels = data.copy.elements as Record<string, string>;
    for (const rule of ELEMENT_RULES) {
      expect(labels[rule.key], rule.key).toBeTruthy();
      for (const id of rule.actions ?? []) expect(known.actions, `${rule.key}: ${id}`).toContain(id);
    }
    expect(ELEMENT_RULES.map((r) => r.key)).not.toContain('rulebook');
    expect(Object.keys(labels)).not.toContain('rulebook');
    // the migration approach left the Atlas (Swann, 5 October 2026): no rule and no label for it
    expect(ELEMENT_RULES.map((r) => r.key)).not.toContain('approach');
    expect(ELEMENT_RULES.map((r) => r.tool)).not.toContain('approach');
    expect(Object.keys(labels)).not.toContain('approach');
    expect(supplierActions).toHaveLength(6);
  });

  it('links each question to its guide page and to the page that does its job, in a preview build', () => {
    const links = checkLinks(data, preview);
    expect(links.guides['eu-roadmap']).toBe('/prepare/guides/eu-roadmap');
    expect(Object.keys(links.guides)).toEqual(data.frameworks.map((f) => f.id));
    expect(links.elements['eu-scope']).toBeUndefined();
    expect(links.elements['nl-mosca'].map((l) => l.href)).toEqual(['/prepare/exposure']);
    expect(links.elements['ncsc-data-record'].map((l) => l.href)).toEqual(['/prepare/exposure', '/prepare/inventory']);
    expect(links.elements['ca-inventory-fields'].map((l) => l.href)).toEqual(['/prepare/inventory']);
    expect(links.elements['eu-inventory'].map((l) => l.href)).toEqual(['/prepare/inventory']);
    // the migration approach left the Atlas (Swann, 5 October 2026): the route action links to no page
    expect(links.elements['ncsc-approach']).toBeUndefined();
    // Where the guides differ left the site (Swann, 4 October 2026): the hybrid action links to no page
    expect(links.elements['eu-hybrid']).toBeUndefined();
    for (const id of supplierActions) {
      expect(links.elements[id], id).toEqual([{ href: '/prepare/suppliers', label: data.copy.elements.suppliers, carriesSources: true }]);
    }
    expect(links.next.map((n) => n.href)).toEqual(['/prepare/guides', '/prepare/exposure']);
    expect(JSON.stringify(links)).not.toMatch(/eu-rules|rulebook|differences|\/prepare\/approach|\/elsewhere/);
  });

  it('links no question to the migration approach in any build, the local one included', () => {
    const builds = [
      {},
      { VERCEL: '1', VERCEL_ENV: 'preview' },
      { VERCEL: '1', VERCEL_ENV: 'production' },
      { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'readiness,inventory,approach,suppliers,exposure' },
    ];
    for (const env of builds) {
      const links = checkLinks(data, { env });
      expect(links.elements['ncsc-approach'], JSON.stringify(env)).toBeUndefined();
      expect(JSON.stringify(links), JSON.stringify(env)).not.toMatch(/\/prepare\/approach|\/elsewhere|Choose a route for each system/);
    }
  });

  it('names no hidden page: with the supplier letter and the other elements hidden, no link to them reaches the props', () => {
    const links = checkLinks(data, checkOnly);
    for (const id of supplierActions) expect(links.elements[id], id).toBeUndefined();
    expect(links.elements['nl-mosca']).toBeUndefined();
    expect(links.elements['eu-inventory']).toBeUndefined();
    expect(links.elements['ncsc-approach']).toBeUndefined();
    // the guide pages share the Check's gate, so they stay
    expect(links.elements['eu-hybrid']).toBeUndefined();
    expect(links.guides['ca-roadmap']).toBe('/prepare/guides/ca-roadmap');
    expect(links.next.map((n) => n.href)).toEqual(['/prepare/guides', null]);

    const props = JSON.stringify({ copy: islandCopy(data.copy), guides: links.guides, elements: links.elements });
    for (const hidden of ['/prepare/suppliers', '/prepare/inventory', '/prepare/approach', '/elsewhere/approach', '/prepare/exposure']) {
      expect(props, hidden).not.toContain(hidden);
    }
    for (const label of ['suppliers', 'inventory', 'exposure']) {
      expect(props, label).not.toContain(data.copy.elements[label]);
    }
  });

  it('carries the chosen guides to the supplier letter as ?f=, and nothing to the other pages', () => {
    const letter = { href: '/prepare/suppliers', carriesSources: true };
    expect(elementHref(letter, ['eu-roadmap', 'ncsc-timelines'])).toBe('/prepare/suppliers?f=eu-roadmap,ncsc-timelines');
    expect(elementHref(letter, [])).toBe('/prepare/suppliers');
    expect(elementHref({ href: '/prepare/suppliers?x=1#top', carriesSources: true }, ['anssi-faq'])).toBe('/prepare/suppliers?x=1&f=anssi-faq#top');
    expect(elementHref({ href: '/prepare/suppliers?f=old', carriesSources: true }, ['anssi-faq'])).toBe('/prepare/suppliers?f=anssi-faq');
    expect(elementHref({ href: '/prepare/inventory', carriesSources: false }, ['eu-roadmap'])).toBe('/prepare/inventory');
  });
});

describe('source words', () => {
  it('a build that may not carry them sends no excerpt to the island, and keeps the source named and linked', () => {
    const none = islandData(data, false);
    const text = JSON.stringify(none);
    for (const a of data.actions) for (const p of a.provenance) if (p.excerpt) expect(text.includes(p.excerpt), a.id).toBe(false);
    expect(text).not.toMatch(/"excerpt"/);
    const first = none.actions.find((a) => a.id === 'eu-inventory')!.provenance[0];
    expect(first.url).toMatch(/^https:\/\//);
    expect(first.title).toBeTruthy();
    expect(first.locator).toBeTruthy();
    // a milestone's provenance never travels to the island
    for (const f of none.frameworks) for (const m of f.milestones) expect(m.provenance).toEqual([]);
  });

  it('a local or preview build keeps them in the props, for ?review=1 alone', () => {
    const some = islandData(data, true);
    const own = data.actions.find((a) => a.id === 'eu-inventory')!.provenance[0].excerpt;
    expect(some.actions.find((a) => a.id === 'eu-inventory')!.provenance[0].excerpt).toBe(own);
    expect(islandProvenance({ url: 'https://x.test', retrievedAt: '2026-10-01', excerpt: 'w' }, false)).toEqual({ url: 'https://x.test', retrievedAt: '2026-10-01' });
  });

  it("no visible copy offers a source's own words to a visitor", () => {
    const sent = JSON.stringify(islandCopy(data.copy));
    expect(sent).not.toMatch(/in the guide's own words|in each issuer's own words|open under each action/);
    expect(data.copy).not.toHaveProperty('sourceWords');
  });
});

describe('the kinds of date', () => {
  it('uses only the five kinds, each with a label, so no raw key reaches a visitor', () => {
    const kinds = ['plan', 'priority', 'complete', 'procurement', 'other'];
    for (const f of data.frameworks) for (const m of f.milestones) expect(kinds, `${f.id}:${m.id}`).toContain(m.kind);
    for (const k of kinds) expect(String(data.copy.kindLabel?.[k] ?? '').trim(), k).not.toBe('');
  });
});

describe('the day the words were checked', () => {
  it('finds the first and the last day a record was checked, anywhere in the file', () => {
    const two = { a: [{ verifiedAt: '2026-10-01' }, { b: { verifiedAt: '2026-11-14' } }], c: { verifiedAt: '2026-09-30' } };
    expect(verifiedSpan(two)).toEqual({ first: '2026-09-30', last: '2026-11-14' });
    expect(verifiedSpan({ a: [{ verify: true }] })).toBeNull();
  });

  it('names one day when every record was checked on it, both ends otherwise, and none when nothing is checked', () => {
    expect(checkedSentence(data.copy, { first: '2026-10-01', last: '2026-10-01' })).toBe("The source's words behind each question were read and checked on 1 October 2026.");
    expect(checkedSentence(data.copy, { first: '2026-10-01', last: '2026-11-14' })).toBe(
      "The source's words behind each question were read and checked between 1 October 2026 and 14 November 2026.",
    );
    expect(checkedSentence(data.copy, null)).toBe("Each question rests on the source's own words.");
    expect(checkedSentence(data.copy, null)).not.toMatch(/on \.|\{/);
    expect(data.copy.method1).toContain('{checked}');
    expect(islandCopy(data.copy)).not.toHaveProperty('checkedOn');
  });
});

describe('the copy the island receives', () => {
  const sent = islandCopy(data.copy);

  it('leaves out what only the server renders', () => {
    for (const k of ['elements', 'question', 'lede', 'method1', 'method6', 'nextGuides', 'noscript']) expect(sent, k).not.toHaveProperty(k);
    for (const k of ['position', 'answer', 'asxFirstHead', 'targetsNote', 'targetBy']) expect(sent, k).toHaveProperty(k);
  });

  it('names the four answers and the two roles', () => {
    expect(Object.values(data.copy.answer)).toEqual(['Done', 'In progress', 'Not started', 'Not applicable']);
    expect(Object.keys(data.copy.role)).toEqual(['organisation', 'public-administration']);
    expect(data.copy.position).toBe('{group}, question {n} of {count}');
  });

  it('calls dates target dates: no clock outside the Exposure Clock, and no deadline but in "not a legal deadline"', () => {
    const text = JSON.stringify(data.copy);
    expect(text.replace(/Exposure Clock/g, '')).not.toMatch(/\bclocks?\b/i);
    expect(text.replace(/not a legal deadline|None is a legal deadline/g, '')).not.toMatch(/deadline/i);
    expect(data.copy.asxTarget).toMatch(/^target /);
  });

  it('asks the question as the H1', () => {
    expect(data.copy.question).toBe('What does published guidance ask an organisation to do?');
    expect(countWord(data.frameworks.length)).toBe('seven');
    expect(countWord(41)).toBe('41');
  });

  it('carries no total, percentage or progress bar wording', () => {
    const text = JSON.stringify(data.copy).toLowerCase();
    expect(text).not.toMatch(/progress bar|\btotal\b(?! would)|completed \d|\d+ of \d+|per cent|%/);
    // "score" only where the copy says there is none
    expect(text.replace(/there is no score, percentage or overall reading|no score/g, '')).not.toMatch(/\bscore\b/);
  });
});
