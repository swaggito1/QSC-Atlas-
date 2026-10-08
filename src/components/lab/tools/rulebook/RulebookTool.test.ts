// The EU rules island as the server renders it, with the props the page gives it: no "clock" in
// the markup or the props, "Reporting deadlines" heading the regimes, no note on compliance (the
// frame writes that once, under the question), no link to any Atlas page but an absolute country
// profile, the worked examples taking turns in one slot with a Pause control, the outcome and the
// count of reports waiting for an answer, and the law's own words never in the server's markup.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import RulebookTool from './RulebookTool';
import type { RulebookProps } from './RulebookTool';
import { INSTRUMENTS, THEMES, islandCopy, islandData, loadRulebook, rulebookLinks } from '../../../../lib/lab/rulebook-data';
import { WORKED_EXAMPLES, answersToSearch } from '../../../../lib/lab/scope';
import type { Answers } from '../../../../lib/lab/scope';
import { loadTools } from '../../../../lib/lab/load';
import { otherSitesRoot } from '../../../../lib/lab/registry-fixture';

function islandProps(sourceWords = true, initialAnswers?: Answers): RulebookProps {
  const data = loadRulebook();
  const island = islandData(data, sourceWords);
  return {
    copy: islandCopy(data.copy),
    articles: island.articles,
    regimes: island.regimes,
    obligations: island.obligations,
    proposals: data.proposals,
    sectors: data.sectors,
    sizeClasses: data.sizeClasses,
    rules: island.rules,
    memberStates: data.memberStates,
    lawAsOf: data.lawAsOf,
    instruments: INSTRUMENTS.map((i) => ({ celex: i.celex, short: i.short })),
    themes: [...THEMES],
    profiles: rulebookLinks(data).profiles,
    sourceWordsAvailable: sourceWords,
    initialAnswers,
  };
}

// an organisation every drawn regime reaches: a large French bank that makes connected products,
// has been identified as a critical entity and controls personal data; the AI question unanswered
const EVERY_REGIME: Answers = {
  sector: 'banking',
  size: 'large',
  established: 'FRA',
  q: { alwaysInScopeService: 'yes', publicAdmin: 'no', productsDigital: 'yes', financialEntity: 'yes', cerDesignated: 'yes', personalDataController: 'yes' },
};

const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

describe('the EU rules island, before any answer', () => {
  const props = islandProps();
  const html = renderToString(createElement(RulebookTool, props));
  const { copy } = loadRulebook();

  it('says "clock" nowhere, in its markup or in the props the page serialises for it', () => {
    expect(html).not.toMatch(/clock/i);
    expect(JSON.stringify(props)).not.toMatch(/clock/i);
  });
  it('heads the regimes "Reporting deadlines"', () => {
    expect(html).toMatch(/<h2 id="rb-dl-h" class="section-h">Reporting deadlines<\/h2>/);
  });
  it('carries no note on compliance: the frame writes it once, under the question', () => {
    expect(html).not.toContain(copy.standing);
    expect(html).not.toContain('compliant');
    expect(JSON.stringify(props)).not.toContain(copy.standing);
  });
  it('links to no AI tool', () => {
    // the real registry holds no ai tool, so a fixture entry of that site stands in (registry-fixture.ts)
    const aiRoutes = loadTools({ root: otherSitesRoot() }).tools.filter((t) => t.site === 'ai').map((t) => t.route);
    for (const r of aiRoutes) expect(hrefsOf(html).some((h) => h.startsWith(r))).toBe(false);
    expect(JSON.stringify(props)).not.toMatch(/\/lab\/ai/);
  });
  it('links to no Atlas page, so it reads the same on a site of its own: only its own answers and full addresses', () => {
    for (const h of hrefsOf(html)) expect(h.startsWith('?') || h.startsWith('https://')).toBe(true);
    for (const href of Object.values(props.profiles ?? {})) expect(href).toMatch(/^https:\/\/[^/]+\/countries\/[a-z]{3}$/);
    expect(JSON.stringify(props)).not.toMatch(/"\/(prepare|standards|documents|methodology|lab)\b/);
  });
  it('offers the worked examples one at a time, in one slot, with a visible Pause control', () => {
    const slot = html.match(/<ul class="rb-ex-slot"[^>]*>(.*?)<\/ul>/)?.[1] ?? '';
    const items = [...slot.matchAll(/<li( class="is-on")?>/g)];
    expect(items.length).toBe(WORKED_EXAMPLES.length);
    expect(items.filter((m) => m[1]).length).toBe(1); // exactly one in view
    expect(items[0][1]).toBeTruthy(); // the first, on the server and in the first client render
    for (const ex of WORKED_EXAMPLES) expect(slot).toContain(`href="${answersToSearch(ex.a).replace(/&/g, '&amp;')}"`);
    expect(html).toContain(`aria-label="${copy.examplesPauseLabel}"`);
    expect(html).toContain(`<span>${copy.examplesPause}</span>`);
  });
  it('waits for an answer before the outcome and the count of reports', () => {
    expect(html).toContain(copy.outcomesEmpty);
    expect(html).toContain(copy.deadlinesEmpty);
    expect(html).not.toContain('class="rb-sentence');
    expect(html).not.toContain(copy.deadlinesSentence.split('{n}')[0]);
    expect(html).not.toContain('class="rb-drow ');
  });
  it('folds the article map, the proposals and the table behind one disclosure, closed', () => {
    expect(html).toMatch(/<details class="lab-section rb-detail lab-disclose"><summary><h2 class="section-h">The articles behind these rules<\/h2><\/summary>/);
    expect(html).toContain(`<caption>${copy.tableArticles}</caption>`);
  });
  it('keeps Start again in its place, hidden and unreachable, until there is an answer', () => {
    expect(html).toMatch(/<button type="button" class="rb-reset is-idle" disabled="">/);
  });
});

describe('the EU rules island, with answers', () => {
  const props = islandProps(true, EVERY_REGIME);
  const html = renderToString(createElement(RulebookTool, props));
  const { copy } = loadRulebook();

  it('says how many reports one incident can start, under the rules that appear to apply', () => {
    expect(html).toContain('class="rb-sentence rb-enter"');
    expect(html).toContain('under the rules that appear to apply.');
  });
  it('keeps each outcome to one line, its article references in view and its reasons one click away', () => {
    const rows = [...html.matchAll(/<li data-flip="([^"]+)" class="rb-outcome is-([a-z-]+)"[^>]*><details class="rb-why"><summary>(.*?)<\/summary>(.*?)<\/details><\/li>/g)];
    expect(rows.length).toBe(INSTRUMENTS.length);
    const nis2 = rows.find((r) => r[1] === '32022L2555')!;
    expect(nis2[3]).toContain('Article 2(2)(a)');
    expect(nis2[4]).toContain('https://eur-lex.europa.eu/');
    expect(nis2[4]).toContain('Read NIS2 on EUR-Lex');
  });
  it('tells the visitor why the AI Act\'s reporting deadlines are not drawn, behind a disclosure', () => {
    expect(html).toContain('<summary>AI Act: its reporting deadlines are not drawn</summary>');
  });
  it('says the values it supplies for DORA and the CRA are the visitor\'s assumptions, in the fold\'s own line', () => {
    expect(html).toContain(copy.deadlinesAssumed);
    expect(html).toContain('For DORA, suppose the incident is classified as major after');
    expect(html).toContain('For CRA, suppose a fix is available after');
    expect(html).toContain('DORA classified as major after 2 hours; CRA fix after 10 days');
  });
  it('gives the deadlines a table', () => {
    expect(html).toContain(`<caption>${copy.tableDeadlines}</caption>`);
  });

  // the deadlines table, row by row: its row head and each labelled cell
  const rows = [...html.matchAll(/<tr><th scope="row">([^<]*)<\/th>(.*?)<\/tr>/g)].map((m) => ({
    head: m[1],
    cells: Object.fromEntries([...m[2].matchAll(/<td data-label="([^"]*)"[^>]*>(.*?)<\/td>/g)].map((c) => [c[1], c[2].replace(/<!-- -->/g, '')])),
  }));
  const dlRows = rows.filter((r) => copy.colSetBy in r.cells);

  it('names each regime in the table by its act and article, so two CRA regimes are told apart', () => {
    const heads = new Set(dlRows.map((r) => r.head));
    expect(heads).toContain('CRA Article 14(2)');
    expect(heads).toContain('CRA Article 14(4)');
    expect(heads).toContain('DORA Article 19(4)');
  });
  it('never gives a time limit the date of an act that does not set it', () => {
    const elsewhere = props.regimes.filter((r) => r.timeLimitCelex);
    expect(elsewhere.length).toBeGreaterThan(0);
    for (const r of elsewhere) {
      const mine = dlRows.filter((x) => x.head.startsWith(`${r.shortLabel} `));
      expect(mine.length).toBe(r.steps.length);
      for (const row of mine) {
        // the row is set by another act, and its cell says so instead of giving the base act's date
        expect(row.cells[copy.colSetBy]).not.toMatch(/^Article/);
        expect(row.cells[copy.colApplies]).toMatch(new RegExp(`^${r.shortLabel} `));
        expect(row.cells[copy.colApplies]).toContain('the date its time limits apply from is not recorded');
      }
    }
  });
  it('gives a regime with no single date its recorded condition, in the panel\'s words', () => {
    const cer = props.regimes.find((r) => r.id === 'cer-art15')!;
    const cell = dlRows.find((x) => x.head.startsWith('CER '))!.cells[copy.colApplies];
    expect(cell).toBe(`in force; applies to ${cer.who.charAt(0).toLowerCase()}${cer.who.slice(1)}`);
    expect(cell).not.toBe(copy.statusInForce);
  });
  it('shows Start again once there is an answer', () => {
    expect(html).toMatch(/<button type="button" class="rb-reset">/);
  });
});

describe('the law\'s own words', () => {
  const data = loadRulebook();
  const quotes = data.articles.flatMap((a) => a.paragraphs.map((p) => p.quote)).filter((q) => q.length > 40);
  const sentences = data.obligations.map((o) => o.sentence).filter((s) => s.length > 40);
  // the excerpts behind each scope rule: the island reads only a rule's reason and article
  const excerpts = (data.rules as unknown as { provenance?: { excerpt: string }[] }[]).flatMap((r) => (r.provenance ?? []).map((p) => p.excerpt)).filter((e) => e.length > 40);

  it('never reach the server\'s markup, even in a build that carries them: they wait for a review page', () => {
    const html = renderToString(createElement(RulebookTool, islandProps(true, EVERY_REGIME)));
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) expect(html).not.toContain(q);
    for (const s of sentences) expect(html).not.toContain(s);
    for (const e of excerpts) expect(html).not.toContain(e);
  });
  it('stay out of the props of a build that may not carry them, so they never reach its HTML', () => {
    const json = JSON.stringify(islandProps(false));
    for (const q of quotes) expect(json).not.toContain(JSON.stringify(q).slice(1, -1));
    for (const s of sentences) expect(json).not.toContain(JSON.stringify(s).slice(1, -1));
  });
  it('never send a scope rule\'s provenance, in any build: the island reads only its reason and article', () => {
    expect(excerpts.length).toBeGreaterThan(0);
    for (const sw of [true, false]) {
      const json = JSON.stringify(islandProps(sw).rules);
      expect(json).not.toContain('provenance');
      for (const e of excerpts) expect(json).not.toContain(JSON.stringify(e).slice(1, -1));
    }
  });
});
