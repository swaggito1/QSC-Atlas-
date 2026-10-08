import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadTools } from '../lab/load';
import { allPrivateRoot } from '../lab/registry-fixture';
import { scanString } from '../../../labs/tools/style-scan.mjs'; // the house-style scanner, typed from its JS (allowJs)
import { PREPARE_QUESTION } from './routes';
import { hubCopy, hubGroups, hubModel } from './prepare-hub';

// The raw file, read here without the module under test, so the counts are checked against
// the data and not against the code that computes them.
const raw = JSON.parse(readFileSync('data/lab/readiness/readiness.json', 'utf8')) as {
  frameworks: { id: string; shortLabel: string; provenance: { excerpt: string }[] }[];
  domains: { id: string; label: string; description: string }[];
  actions: { id: string; domain: string; source: string; provenance: { excerpt: string }[] }[];
};
const DEFAULTS = ['eu-roadmap', 'ncsc-timelines'];

const PREVIEW = { env: { VERCEL: '1', VERCEL_ENV: 'preview' } };
const atlasIds = loadTools()
  .tools.filter((t) => (t.site ?? 'atlas') === 'atlas')
  .map((t) => t.id);
// the real registry with every tool private again (src/lib/lab/registry-fixture.ts): ALL_OFF is
// stage 0, and a flag state forces exactly the tools it names
const STAGE0 = allPrivateRoot();
const only = (ids: string) => ({ root: STAGE0, env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: ids } });
const ALL_OFF = { root: STAGE0, env: { VERCEL: '1', VERCEL_ENV: 'production' } };
const ALL_ON = only(atlasIds.join(','));

describe('What the guides ask', () => {
  it('lists the six groups in the Check order, each with its own name and line from readiness.json', () => {
    const groups = hubGroups(PREVIEW);
    expect(groups.map((g) => g.id)).toEqual(raw.domains.map((d) => d.id));
    for (const g of groups) {
      const d = raw.domains.find((x) => x.id === g.id)!;
      expect([g.label, g.description]).toEqual([d.label, d.description]);
    }
  });

  it('counts the questions the Check asks with the guides it starts with, 3, 4, 7, 2, 5 and 2, computed from the data', () => {
    const groups = hubGroups(PREVIEW);
    const fromData = raw.domains.map((d) => raw.actions.filter((a) => a.domain === d.id && DEFAULTS.includes(a.source)).length);
    expect(groups.map((g) => g.count)).toEqual(fromData);
    expect(groups.map((g) => g.count)).toEqual([3, 4, 7, 2, 5, 2]);
    expect(groups.map((g) => g.countLabel)).toEqual(['3 questions', '4 questions', '7 questions', '2 questions', '5 questions', '2 questions']);
  });

  it('opens the Check at each group', () => {
    for (const g of hubGroups(PREVIEW)) expect(g.href).toBe(`/prepare/check?theme=${g.id}`);
  });

  it('says once whose counts they are, naming the two guides the Check starts with', () => {
    expect(hubModel(PREVIEW).groupsIntro).toBe(
      'Six groups of questions, to take in any order. The counts are for the EU roadmap and the NCSC timelines, the guides the Check starts with.',
    );
  });

  it('is empty when the Check is hidden', () => {
    expect(hubGroups(only('exposure'))).toEqual([]);
    expect(hubGroups(only('suppliers'))).toEqual([]);
  });
});

describe('the hub', () => {
  it('asks the section question as its H1, in one sentence under it, with the standing note', () => {
    const hub = hubModel(PREVIEW);
    expect(hub.built && hub.readiness).toBe(true);
    expect(hub.h1).toBe(PREPARE_QUESTION);
    expect(hub.lede.split(/[.!?](\s|$)/).filter((s) => s.trim()).length).toBe(1);
    expect(hub.standingNote).toMatch(/target/);
    expect(hub.standingNote).toMatch(/None is a legal deadline\.$/);
  });

  it('offers one way in, the Check itself, which asks once whom the visitor answers for (Swann, 4 October 2026)', () => {
    const hub = hubModel(PREVIEW);
    expect(hub.start).toEqual({ label: 'Start the Check', href: '/prepare/check' });
    // nothing on the hub asks whom the visitor answers for: no audience link and no ?as=
    expect(JSON.stringify(hub)).not.toMatch(/[?&]as=|For an organisation|For a government/);
  });

  it('links to the guides once, with their number computed', () => {
    expect(hubModel(PREVIEW).guides).toEqual({ label: `The ${'seven'} guides behind the questions`, href: '/prepare/guides' });
    expect(raw.frameworks).toHaveLength(7);
  });

  it('links About this section to the Check method and lists every document the guides are read from', () => {
    const hub = hubModel(PREVIEW);
    expect(hub.methodTool).toBe('readiness');
    expect(hub.sources).toHaveLength(8);
    expect(new Set(hub.sources.map((s) => s.url)).size).toBe(8);
  });

  it('never mentions or links EU rules', () => {
    for (const opts of [PREVIEW, ALL_ON]) {
      const text = JSON.stringify(hubModel(opts));
      expect(text).not.toMatch(/eu-rules|rulebook|EU rules/i);
    }
    expect(JSON.stringify(hubCopy(PREVIEW))).not.toMatch(/EU rules|rulebook/i);
  });

  it('shows no source words: no excerpt from readiness.json reaches the model', () => {
    const text = JSON.stringify(hubModel(PREVIEW));
    const excerpts = [...raw.frameworks.flatMap((f) => f.provenance), ...raw.actions.flatMap((a) => a.provenance)].map((p) => p.excerpt);
    for (const e of excerpts) expect(text.includes(e), e.slice(0, 40)).toBe(false);
    expect(text).not.toMatch(/"excerpt"/);
  });

  it('with the Check hidden names only the Prepare tools this build shows', () => {
    const hub = hubModel(only('exposure'));
    expect(hub.built).toBe(true);
    expect(hub.readiness).toBe(false);
    expect(hub.start).toBeNull();
    expect(hub.groups).toEqual([]);
    expect(hub.guides).toBeNull();
    expect(hub.standingNote).toBeNull();
    expect(hub.others).toEqual([{ label: 'How long your data must stay secret: the Exposure Clock', href: '/prepare/exposure' }]);
    expect(hub.methodTool).toBe('exposure');
    expect(JSON.stringify(hub)).not.toMatch(/\/prepare\/(check|guides|differences|suppliers|inventory|approach)/);
  });

  it('is not built with every tool private, and lists nothing then', () => {
    const hub = hubModel(ALL_OFF);
    expect(hub.built).toBe(false);
    expect(hub.start).toBeNull();
    expect(hub.groups).toEqual([]);
    expect(hub.others).toEqual([]);
  });
});

describe('the copy', () => {
  const copy = hubCopy(PREVIEW);
  const strings = Object.entries(copy).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as const] : Object.entries(v).map(([kk, vv]) => [`${k}.${kk}`, vv] as const)));

  it('offers no total, percentage, progress or score', () => {
    for (const [k, v] of strings) expect(v, k).not.toMatch(/%|percent|progress|\btotal|\bscore|\blevel|ranking/i);
    // addresses carry percent escapes (%20); everything else is visible text
    expect(JSON.stringify(hubModel(PREVIEW)).replace(/https?:\/\/[^"\s]+/g, '')).not.toMatch(/\d\s?%/);
  });

  it('carries no em or en dash, and no house-style HARD finding', () => {
    const text = readFileSync('data/lab/prepare/hub-copy.json', 'utf8');
    expect(text).not.toMatch(new RegExp('[\\u2013\\u2014]'));
    for (const [k, v] of strings) {
      const hard = scanString(v).filter((x: { level: string }) => x.level === 'HARD');
      expect(hard, `${k}: ${v}`).toEqual([]);
    }
  });

  it('keeps the hub short: no key of the old quoted columns, rows of links or printed checklist', () => {
    for (const k of ['orgLine1', 'govLine1', 'beforeHead', 'actLinkRules', 'printChecklist', 'groupsNote', 'elInventory', 'factNoScore', 'waysHead', 'wayOrganisation', 'wayGovernment']) {
      expect(copy, k).not.toHaveProperty(k);
    }
    expect(Object.keys(copy).filter((k) => /Q\d?$/.test(k))).toEqual([]);
  });
});
