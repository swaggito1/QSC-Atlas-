import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INSTRUMENTS, countWord, deadlineWords, islandCopy, islandData, loadRulebook, rulebookLinks, scopeLine, templateParts } from './rulebook-data';
import { absoluteUrl } from '../site/config';
import { regimeArticleKey, touchingProposals } from './scope';
import { loadExposure } from './exposure-data';
import { loadTools, projectRoot } from './load';
import { otherSitesRoot } from './registry-fixture';

const PROD = { env: { VERCEL_ENV: 'production' } };

describe('the Rulebook data', () => {
  const d = loadRulebook();
  it('hides the AI Act reporting deadlines while their application date is unconfirmed, and says why (decision 6)', () => {
    const ai = d.regimes.find((r) => r.id === 'aiact-art73');
    expect(ai?.hiddenReason).toBeTruthy();
  });
  it('keeps the AI Act as one of the six acts (decision 6)', () => {
    expect(INSTRUMENTS.map((i) => i.short)).toContain('AI Act');
    expect(d.scope.acts).toBe(INSTRUMENTS.length);
  });
  it('keeps proposals apart: every proposal is a proposal, and no regime or obligation is one', () => {
    expect(d.proposals.length).toBeGreaterThan(0);
    expect(d.regimes.every((r) => r.status !== 'proposal')).toBe(true);
    expect(d.obligations.every((o) => o.status !== 'proposal')).toBe(true);
  });
  it('drops every unapproved obligation from a production build', () => {
    const prod = loadRulebook(PROD);
    expect(prod.obligations.every((o) => o.verified)).toBe(true);
  });
  it('cites the acts the page reads values from beside the six base acts', () => {
    const urls = d.sources.map((s) => s.url ?? '');
    expect(urls.some((u) => u.endsWith('CELEX:32025R0301'))).toBe(true); // DORA's time limits
    expect(urls.some((u) => u.endsWith('CELEX:32026R1744'))).toBe(true); // the AI Act's high-risk dates
    expect(d.sources.every((s) => s.date)).toBe(true);
  });
  it('orders the articles as the map reads: by instrument, then theme, then article number', () => {
    const order: string[] = INSTRUMENTS.map((i) => i.celex);
    const idx = d.articles.map((a) => order.indexOf(a.celex));
    expect(idx).toEqual([...idx].sort((x, y) => x - y));
  });
  it('matches each reporting regime to the proposals that touch the article setting it', () => {
    const ids = (regimeId: string) => {
      const r = d.regimes.find((x) => x.id === regimeId)!;
      return touchingProposals(d.proposals, regimeArticleKey(r)).map((p) => p.id).sort();
    };
    expect(ids('gdpr-art33')).toEqual(['com-2025-837']);
    expect(ids('cer-art15')).toEqual(['com-2025-837']);
    expect(ids('dora-art19')).toEqual(['com-2025-837']);
    expect(ids('nis2-art23')).toEqual(['com-2025-837', 'com-2026-13']);
    expect(ids('cra-art14-vuln')).toEqual([]);
    expect(ids('cra-art14-incident')).toEqual([]);
  });
});

describe('the reporting deadlines vocabulary', () => {
  it('reads the older word in a data string as "reporting deadline", and leaves proper names alone', () => {
    expect(deadlineWords('so the date from which this clock runs')).toBe('so the date from which this reporting deadline runs');
    expect(deadlineWords('two clocks start')).toBe('two reporting deadlines start');
    expect(deadlineWords('the Exposure Clock')).toBe('the Exposure Clock');
  });
  it('lets no "clock" reach the island, in its copy or in its data', () => {
    const d = loadRulebook();
    const island = {
      copy: islandCopy(d.copy),
      ...islandData(d, true),
      proposals: d.proposals,
      sectors: d.sectors,
      sizeClasses: d.sizeClasses,
      memberStates: d.memberStates,
      profiles: rulebookLinks(d).profiles,
    };
    expect(JSON.stringify(island)).not.toMatch(/clock/i);
  });
  it('heads the regimes "Reporting deadlines" and calls no reporting time a clock anywhere in the copy', () => {
    const { copy } = loadRulebook();
    expect(copy.deadlinesHeading).toBe('Reporting deadlines');
    for (const [k, v] of Object.entries(copy)) {
      expect(k).not.toMatch(/clock/i);
      expect(v).not.toMatch(/clock/i);
    }
  });
});

describe('the standing note on compliance', () => {
  it('stays with the server, so the frame writes it once, under the question', () => {
    const { copy } = loadRulebook();
    expect(copy.standing).toMatch(/does not tell you whether you are compliant/);
    expect(copy.standing).toMatch(/^EU instruments only/);
    expect(copy.standing).toMatch(/not legal advice/);
    const island = islandCopy(copy);
    expect(Object.values(island).some((v) => v.includes('compliant'))).toBe(false);
    for (const k of ['question', 'lede', 'description', 'readsActs', 'scopeLead', 'scopeOne', 'standing', 'method', 'nextGuides']) {
      expect(island[k]).toBeUndefined();
    }
  });
});

describe('the scope line', () => {
  it('counts the obligations that are law and those whose law text names cryptography', () => {
    const d = loadRulebook();
    expect(d.scope.obligations).toBe(d.obligations.length);
    expect(d.scope.crypto).toBeGreaterThan(0);
    expect(d.scope.crypto).toBeLessThan(d.scope.obligations);
    const line = scopeLine(d.copy, d.scope);
    expect(line.text).toBe(
      `EU instruments only. These rules govern cybersecurity in general; ${d.scope.crypto} of their ${d.scope.obligations} obligations ${d.scope.crypto === 1 ? 'mentions' : 'mention'} cryptography.`,
    );
    expect(line.parts.filter((p) => 'mono' in p)).toEqual([{ mono: String(d.scope.crypto) }, { mono: String(d.scope.obligations) }]);
  });
  it('leaves the count out when no obligation reaches the page, never showing 0 of 0', () => {
    const d = loadRulebook();
    expect(scopeLine(d.copy, { obligations: 0, crypto: 0 }).text).toBe('EU instruments only. These rules govern cybersecurity in general.');
    expect(scopeLine(d.copy, { obligations: 12, crypto: 0 }).text).toContain('none of their 12 obligations mentions cryptography');
  });

  // a copy of the Rulebook's data in a scratch folder, so a test can change one obligation
  const roots: string[] = [];
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));
  function fixture(edit: (obligations: any[]) => void): string {
    const root = mkdtempSync(join(tmpdir(), 'rulebook-fixture-'));
    roots.push(root);
    cpSync(join(projectRoot(), 'data/lab/rulebook'), join(root, 'data/lab/rulebook'), { recursive: true });
    mkdirSync(join(root, 'data/lab/shared'), { recursive: true });
    cpSync(join(projectRoot(), 'data/lab/shared/memberships.json'), join(root, 'data/lab/shared/memberships.json'));
    const file = join(root, 'data/lab/rulebook/obligations.json');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    edit(json.obligations);
    writeFileSync(file, JSON.stringify(json));
    return root;
  }
  const base = loadRulebook().scope;

  it('follows the data when a fixture obligation changes: a second one that names encryption', () => {
    const root = fixture((obs) => {
      // GDPR Article 34: its paragraph 3(a) names encryption, so pointing the duty there counts it
      const o = obs.find((x) => x.id === 'gdpr-34-1-communicate-data-subjects');
      o.paragraphId = '32016R0679/art34/par3';
    });
    const d = loadRulebook({ root });
    expect(d.scope).toMatchObject({ obligations: base.obligations, crypto: base.crypto + 1 });
    expect(scopeLine(d.copy, d.scope).text).toContain(`${base.crypto + 1} of their ${base.obligations} obligations mention cryptography`);
  });
  it('follows the data when a fixture obligation changes: the one that names cryptography stops being law', () => {
    const root = fixture((obs) => {
      for (const o of obs) if (o.id === 'nis2-21-2-minimum-measures') o.status = 'proposal';
    });
    const d = loadRulebook({ root });
    expect(d.scope).toMatchObject({ obligations: base.obligations - 1, crypto: base.crypto - 1 });
  });
  it('never counts the Atlas draft summary, only the law text', () => {
    const root = fixture((obs) => {
      const o = obs.find((x) => x.id === 'gdpr-33-1-notify-authority');
      o.action = `${o.action} Mind your cryptography.`;
    });
    expect(loadRulebook({ root }).scope.crypto).toBe(base.crypto);
  });
  it('sets each count apart for the mono face', () => {
    expect(templateParts('{a} of {b} things', { a: 1, b: 55 })).toEqual([{ mono: '1' }, { text: ' of ' }, { mono: '55' }, { text: ' things' }]);
    expect(countWord(6)).toBe('six');
    expect(countWord(12)).toBe('12');
  });
});

describe('the page links', () => {
  // the real registry holds no ai tool, so a fixture entry of that site stands in (registry-fixture.ts)
  const aiRoutes = loadTools({ root: otherSitesRoot() }).tools.filter((t) => t.site === 'ai').map((t) => t.route);
  it('opens the Atlas profile of each Member State a visitor can choose, by its full address', () => {
    const d = loadRulebook();
    const { profiles } = rulebookLinks(d);
    expect(Object.keys(profiles).sort()).toEqual(d.memberStates.map((m) => m.iso3).sort());
    expect(profiles.BEL).toBe(absoluteUrl('/countries/bel'));
    expect(profiles.BEL).toMatch(/^https:\/\//);
  });
  it('links to no Prepare page and no other tool, so it reads the same on a site of its own', () => {
    const d = loadRulebook();
    for (const opts of [{}, PROD]) {
      const links = rulebookLinks(d, opts);
      const hrefs = [...links.next.map((l) => l.href), ...Object.values(links.profiles)].filter((h): h is string => Boolean(h));
      for (const h of hrefs) expect(h).toMatch(/^https:\/\/[^/]+\/countries\/[a-z]{3}$/);
    }
    expect(d.copy.nextGuides).toBeUndefined();
    expect(d.copy.nextEuDocuments).toBeUndefined();
  });
  it('keeps one way back into the evidence: the European Union in the Atlas, by its full address', () => {
    const d = loadRulebook();
    const hrefs = rulebookLinks(d, PROD).next.map((l) => l.href).filter(Boolean);
    expect(hrefs).toEqual([absoluteUrl('/countries/euu')]);
  });
  it('links to no AI tool, in its links or its copy', () => {
    expect(aiRoutes.length).toBeGreaterThan(0);
    const d = loadRulebook();
    const all = JSON.stringify({ links: rulebookLinks(d), copy: d.copy });
    for (const r of aiRoutes) expect(all).not.toContain(r);
    expect(all).not.toMatch(/\/lab\/ai/);
  });
});

describe('the island data and the law\'s own words', () => {
  const d = loadRulebook();
  it('carries the article text and the verbatim sentences only in a build that may carry them', () => {
    const local = islandData(d, true);
    expect(local.articles.some((a) => a.paragraphs.some((p) => p.quote))).toBe(true);
    expect(local.obligations.some((o) => o.sentence)).toBe(true);
    const prod = islandData(d, false);
    expect(prod.articles.every((a) => a.paragraphs.every((p) => p.quote === ''))).toBe(true);
    expect(prod.obligations.every((o) => o.sentence === '')).toBe(true);
  });
  it('keeps every article reference, title and link, whatever the build', () => {
    const prod = islandData(d, false);
    expect(prod.articles.map((a) => [a.key, a.ref, a.title, a.eurlex, a.paragraphs.map((p) => p.ref)])).toEqual(d.articles.map((a) => [a.key, a.ref, a.title, a.eurlex, a.paragraphs.map((p) => p.ref)]));
    expect(prod.obligations.map((o) => [o.articleRef, o.url])).toEqual(d.obligations.map((o) => [o.articleRef, o.url]));
  });
  it('never sends what the island does not show: a step\'s quote, a rule\'s provenance', () => {
    for (const sw of [true, false]) {
      const x = islandData(d, sw);
      expect(x.regimes.every((r) => r.steps.every((st) => st.quote === ''))).toBe(true);
      expect(x.rules.every((r) => !('provenance' in r))).toBe(true);
      expect(x.rules.map((r) => r.id)).toEqual(d.rules.map((r) => r.id));
    }
  });
});

describe('the Exposure Clock data', () => {
  it('never passes a deadline without a source to the chart', () => {
    const d = loadExposure();
    for (const list of Object.values(d.deadlines)) for (const dl of list) expect(dl.sourceUrl).toBeTruthy();
  });
  it('shows no survey figure in production that is still a lead', () => {
    const d = loadExposure({ env: { VERCEL_ENV: 'production' } });
    expect(d.surveyRows.every((r) => r.verified)).toBe(true);
  });
  it('lists every EU roadmap add or skip decision for review', () => {
    const d = loadExposure();
    expect(d.decisions.FRA?.length ?? 0).toBeGreaterThan(0);
  });
});
