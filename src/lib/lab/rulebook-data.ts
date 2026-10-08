// QSC Atlas Labs: Rulebook in Motion's data, assembled at build time. Reads the acts register,
// the proposals, the article texts, the reporting regimes, the obligations and the scope rules
// under data/lab/rulebook/. In production, leads (verify: true) never reach the page; in
// preview an obligation that is still a lead carries the copy key obligationDraft ("plain-language
// summary awaiting review") in the panel and in the export. Proposals are kept apart from the law:
// they only ever appear in the overlay, labelled as proposals.
//
// The tool's page (its route is in data/lab/tools.json) also takes from here: the counts of its
// scope line ("These rules govern cybersecurity in general; 1 of their 55 obligations mentions
// cryptography"), the copy its island receives (the strings only the server renders stay here,
// so the standing note on compliance is written once, under the question), the island's data
// with the law's own words left out of a build that may not carry them, and its links. The tool
// stands on its own, so it can live on a site of its own: its only links into the Atlas are
// country profiles, given by their full address and only when the Atlas builds them.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ActsFileSchema,
  ArticleTextFileSchema,
  CopyFileSchema,
  ObligationsFileSchema,
  ProposalsFileSchema,
  RegimesFileSchema,
  ScopeRulesFileSchema,
} from './schema';
import { latestVerifiedAt, loadDataset, loadMemberships, projectRoot } from './load';
import type { LoadOptions } from './load';
import { scopeCounts } from './scope';
import type { ScopeCounts, ScopeRule } from './scope';
import type { SourceEntry } from './format';
import { pageHref } from '../site/gates';
import { absoluteUrl } from '../site/config';

const RB = 'data/lab/rulebook';

export const INSTRUMENTS = [
  { celex: '32022L2555', short: 'NIS2' },
  { celex: '32022L2557', short: 'CER' },
  { celex: '32022R2554', short: 'DORA' },
  { celex: '32024R2847', short: 'CRA' },
  { celex: '32016R0679', short: 'GDPR' },
  { celex: '32024R1689', short: 'AI Act' },
] as const;

export const THEMES = ['scope', 'risk-management', 'incident-reporting', 'supervision', 'dates'] as const;
const THEME_OF: Record<string, (typeof THEMES)[number]> = {
  scope: 'scope',
  definitions: 'scope',
  'risk-management': 'risk-management',
  'incident-reporting': 'incident-reporting',
  supervision: 'supervision',
  jurisdiction: 'supervision',
  dates: 'dates',
};

export interface RbArticle {
  key: string; // CELEX/art23
  celex: string;
  ref: string; // "Article 23"
  title: string;
  theme: (typeof THEMES)[number];
  paragraphs: { id: string; ref: string; quote: string }[];
  crossRefs: string[]; // keys of other articles in the map
  eurlex: string;
}

export interface RbRegime {
  id: string;
  shortLabel: string;
  instrument: string;
  celex: string;
  articleRef: string;
  who: string;
  recipient: string;
  status: string;
  appliesFrom: string | null; // the base act's date (celex), never the date of timeLimitCelex
  timeLimitCelex: string | null; // the act that sets the time limits, when it is not the base act
  hiddenReason: string | null;
  verified: boolean;
  steps: { id: string; label: string; within: number; unit: 'hours' | 'days' | 'months'; from: string; fromKind: 'aware' | 'classified' | 'notification' | 'intermediate' | 'fix'; quote: string; locator: string }[];
}

export interface RbObligation {
  id: string;
  celex: string;
  articleRef: string;
  articleKey: string;
  addressee: string;
  trigger: string | null;
  action: string;
  deadlineId: string | null; // the reporting regime the obligation belongs to, if any
  status: string;
  appliesFrom: string | null;
  sentence: string;
  url: string;
  verified: boolean;
}

export interface RbProposal {
  id: string;
  com: string;
  procedure: string;
  label: string;
  stage: string;
  stageDate: string;
  url: string | null;
  touches: { articleKey: string; articleRef: string; summary: string }[];
}

export interface RulebookData {
  copy: Record<string, string>;
  acts: { celex: string; shortTitle: string; status: string; applies: { date: string; label: string }[]; verified: boolean }[];
  articles: RbArticle[];
  regimes: RbRegime[];
  obligations: RbObligation[];
  proposals: RbProposal[];
  sectors: { id: string; label: string; annex: 'I' | 'II'; cer: boolean; subsectors: { id: string; label: string }[] }[];
  sizeClasses: { id: string; label: string; description: string; source: string }[];
  rules: ScopeRule[];
  memberStates: { iso3: string; name: string }[];
  lawAsOf: string | null;
  asOf: string | null;
  sources: SourceEntry[];
  scope: ScopeCounts & { acts: number; articles: number }; // the scope line and the facts line
}

const eurlex = (celex: string) => `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`;

/**
 * The page's word for the legal time limits after an incident is "reporting deadline" (spec 13),
 * so a data string written with the older word, such as a regime's hiddenReason in regimes.json,
 * is read with the new one. Only the lower-case word changes, so a proper name ("Exposure Clock")
 * is left as it is. A local shim until the data file says it itself.
 */
export function deadlineWords(text: string): string {
  return text.replace(/\bclocks\b/g, 'reporting deadlines').replace(/\bclock\b/g, 'reporting deadline');
}

function exists(path: string, opts: LoadOptions) {
  return existsSync(join(opts.root ?? projectRoot(), path));
}

/** "Article 23(4)" or "Article 3, point (49)" gives "Article 23" / "Article 3". */
export const articleOf = (ref: string) => ref.match(/Article\s+\d+[a-z]?/)?.[0] ?? ref;

export function loadRulebook(opts: LoadOptions = {}): RulebookData {
  const copy = loadDataset(`${RB}/copy.json`, CopyFileSchema, opts).copy as Record<string, string>;
  const acts = exists(`${RB}/acts.json`, opts) ? loadDataset(`${RB}/acts.json`, ActsFileSchema, opts) : null;
  const proposalsFile = exists(`${RB}/proposals.json`, opts) ? loadDataset(`${RB}/proposals.json`, ProposalsFileSchema, opts) : { proposals: [] };
  const regimesFile = exists(`${RB}/regimes.json`, opts) ? loadDataset(`${RB}/regimes.json`, RegimesFileSchema, opts) : { regimes: [] };
  const obligationsFile = exists(`${RB}/obligations.json`, opts) ? loadDataset(`${RB}/obligations.json`, ObligationsFileSchema, opts) : { obligations: [] };
  const scope = exists(`${RB}/scope-rules.json`, opts) ? loadDataset(`${RB}/scope-rules.json`, ScopeRulesFileSchema, opts) : { sectors: [], sizeClasses: [], rules: [] };

  // article texts, one file per act
  const textDir = join(opts.root ?? projectRoot(), RB, 'text');
  const texts = existsSync(textDir)
    ? readdirSync(textDir).filter((f) => f.endsWith('.json')).sort().map((f) => loadDataset(`${RB}/text/${f}`, ArticleTextFileSchema, opts))
    : [];
  const articles: RbArticle[] = [];
  for (const t of texts) {
    for (const a of t.articles) {
      articles.push({
        key: `${t.celex}/${a.id}`,
        celex: t.celex,
        ref: a.ref,
        title: a.sourceTitle,
        theme: THEME_OF[a.theme] ?? 'scope',
        paragraphs: a.paragraphs.map((p) => ({ id: p.id, ref: p.ref, quote: p.quote })),
        crossRefs: [],
        eurlex: t.sourceUrl,
      });
    }
  }
  // cross-references: "Article 23(3)" inside the same act, or another act named by its number
  const actNumber: Record<string, string> = { '2022/2555': '32022L2555', '2022/2557': '32022L2557', '2022/2554': '32022R2554', '2024/2847': '32024R2847', '2016/679': '32016R0679', '2024/1689': '32024R1689' };
  for (const t of texts) {
    for (const a of t.articles) {
      const key = `${t.celex}/${a.id}`;
      const target = new Set<string>();
      for (const p of a.paragraphs) {
        for (const ref of p.crossRefs) {
          const num = Object.keys(actNumber).find((n) => ref.includes(n));
          const celex = num ? actNumber[num] : t.celex;
          const art = articleOf(ref);
          const hit = articles.find((x) => x.celex === celex && x.ref === art && x.key !== key);
          if (hit) target.add(hit.key);
        }
      }
      articles.find((x) => x.key === key)!.crossRefs = [...target];
    }
  }
  // the order a reader meets the dots in: instrument by instrument (the map's columns), then
  // theme by theme (its bands), then by article number; keyboard focus and the table follow it
  const insIndex = (celex: string) => INSTRUMENTS.findIndex((i) => i.celex === celex);
  const artNumber = (ref: string) => Number(ref.match(/\d+/)?.[0] ?? 0);
  articles.sort(
    (a, b) =>
      insIndex(a.celex) - insIndex(b.celex) ||
      THEMES.indexOf(a.theme) - THEMES.indexOf(b.theme) ||
      artNumber(a.ref) - artNumber(b.ref) ||
      a.ref.localeCompare(b.ref),
  );

  const regimes: RbRegime[] = regimesFile.regimes.map((r) => ({
    id: r.id,
    shortLabel: r.shortLabel,
    instrument: r.instrument,
    celex: r.celex,
    articleRef: r.articleRef,
    who: r.who,
    recipient: r.recipient,
    status: r.status,
    appliesFrom: r.appliesFrom,
    timeLimitCelex: r.timeLimitCelex ?? null,
    hiddenReason: r.hiddenReason ? deadlineWords(r.hiddenReason) : null,
    verified: !r.verify,
    steps: r.steps,
  }));

  const obligations: RbObligation[] = obligationsFile.obligations.map((o) => ({
    id: o.id,
    celex: o.celex,
    articleRef: o.articleRef,
    articleKey: `${o.celex}/art${articleOf(o.articleRef).replace(/\D/g, '')}`,
    addressee: o.addressee,
    trigger: o.trigger,
    action: o.action,
    deadlineId: o.clockId,
    status: o.status,
    appliesFrom: o.appliesFrom,
    sentence: o.provenance[0]?.excerpt ?? '',
    url: o.provenance[0]?.url ?? eurlex(o.celex),
    verified: !o.verify,
  }));

  const proposals: RbProposal[] = proposalsFile.proposals.map((p) => ({
    id: p.id,
    com: p.com,
    procedure: p.procedure,
    label: p.label,
    stage: p.stage.label,
    stageDate: p.stage.date,
    url: p.oeilUrl ?? p.commissionUrl,
    touches: p.touches.map((t) => ({ articleKey: `${t.celex}/art${articleOf(t.articleRef).replace(/\D/g, '')}`, articleRef: t.articleRef, summary: t.summary })),
  }));

  // the law's own words for each obligation, for the scope line: its verbatim excerpts and the
  // text of the paragraph it comes from, with that paragraph's points
  const paragraphs = texts.flatMap((t) => t.articles.flatMap((a) => a.paragraphs.map((p) => ({ id: p.id, quote: p.quote }))));
  const lawText = (o: (typeof obligationsFile.obligations)[number]) =>
    [
      ...o.provenance.map((p) => p.excerpt),
      ...paragraphs.filter((p) => p.id === o.paragraphId || p.id.startsWith(`${o.paragraphId}/`)).map((p) => p.quote),
    ].join(' ');
  const counts = scopeCounts(obligationsFile.obligations.map((o) => ({ status: o.status, lawText: lawText(o) })));

  const eu = loadMemberships(opts).lists.find((l) => l.id === 'eu');
  const sources: SourceEntry[] = INSTRUMENTS.map((i) => {
    const a = acts?.acts.find((x) => x.celex === i.celex);
    return { author: 'European Union', date: a?.documentDate ?? null, title: a?.documentTitle ?? i.short, container: 'Official Journal of the European Union', url: eurlex(i.celex) };
  });
  // acts the page reads values from beside the six base acts: the act that sets DORA's time
  // limits (a regime's timeLimitCelex) and any act a verified provenance record quotes, such as
  // the amending regulation behind the AI Act's high-risk dates. Each one is taken from the
  // related-acts list in acts.json, which carries its title and date.
  const relatedAct = new Map((acts?.acts ?? []).flatMap((a) => a.related.map((r) => [r.celex, r] as const)));
  const used = new Set<string>();
  for (const r of regimesFile.regimes) if (r.timeLimitCelex) used.add(r.timeLimitCelex);
  const quoted = [
    ...(acts?.acts ?? []).flatMap((a) => [...a.provenance, ...a.applies.flatMap((x) => x.provenance)]),
    ...regimesFile.regimes.flatMap((r) => r.provenance),
  ];
  for (const p of quoted) {
    const celex = p.url.match(/\/celex\/(3\d{4}[A-Z]\d{4})$/)?.[1];
    if (celex) used.add(celex);
  }
  for (const celex of [...used].filter((c) => relatedAct.has(c)).sort()) {
    const r = relatedAct.get(celex)!;
    const author = /^Commission\b/.test(r.sourceTitle) ? 'European Commission' : 'European Union';
    sources.push({ author, date: r.documentDate, title: r.sourceTitle, container: 'Official Journal of the European Union', url: eurlex(celex) });
  }
  // the size classes. Date read on 2026-10-01 from the Publications Office text of CELEX
  // 32003H0361 (http://publications.europa.eu/resource/celex/32003H0361, official source):
  // "Commission Recommendation of 6 May 2003 concerning the definition of micro, small and
  // medium-sized enterprises"
  sources.push({ author: 'European Commission', date: '2003-05-06', title: 'Commission Recommendation 2003/361/EC concerning the definition of micro, small and medium-sized enterprises', container: 'Official Journal of the European Union', url: eurlex('32003H0361') });

  return {
    copy,
    acts: (acts?.acts ?? []).map((a) => ({ celex: a.celex, shortTitle: a.shortTitle, status: a.status, applies: a.applies.map((x) => ({ date: x.date, label: x.label })), verified: !a.verify })),
    articles,
    regimes,
    obligations,
    proposals,
    sectors: scope.sectors.map((s) => ({ id: s.id, label: s.label, annex: s.annex, cer: s.cer, subsectors: s.subsectors })),
    sizeClasses: scope.sizeClasses.map((c) => ({ id: c.id, label: c.label, description: c.description, source: c.provenance[0]?.locator ?? '' })),
    rules: scope.rules as unknown as ScopeRule[],
    memberStates: (eu?.members ?? []).map((m) => ({ iso3: m.iso3, name: m.name })),
    lawAsOf: acts?.checkedAt ?? null,
    asOf: latestVerifiedAt({ acts, regimesFile, obligationsFile, proposalsFile }),
    sources,
    scope: { ...counts, acts: new Set(articles.map((a) => a.celex)).size, articles: articles.length },
  };
}

// ---- the page: the island's copy, the scope line and the links ---------------------------------

/** Copy keys only the server renders: the head, the scope line, the method, the links and the
    standing note on compliance, which the frame writes once, under the question. The island never
    receives them. */
const SERVER_KEY = /^(question|lede|description|reads[A-Z]\w*|scope[A-Z]\w*|standing|method|next[A-Z]\w*)$/;

/** The copy the island reads: everything but the strings only the server renders. */
export function islandCopy(copy: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(copy).filter(([k]) => !SERVER_KEY.test(k)));
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** A count as the reading copy writes it: words up to ten, figures above. */
export function countWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

/** A piece of a sentence: plain text, or a count set in the mono face. */
export type Part = { text: string } | { mono: string };

/** A template with its {placeholders} filled, each value kept apart so the page sets it in mono. */
export function templateParts(template: string, vars: Record<string, string | number>): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    if (!(m[1] in vars)) continue;
    if (m.index! > last) parts.push({ text: template.slice(last, m.index) });
    parts.push({ mono: String(vars[m[1]]) });
    last = m.index! + m[0].length;
  }
  if (last < template.length) parts.push({ text: template.slice(last) });
  return parts;
}

/**
 * The scope line (spec 5.2): "EU instruments only." and then, from the counts, "These rules govern
 * cybersecurity in general; 1 of their 55 obligations mentions cryptography." With no obligation
 * on the page (a production build before any is approved) the count is left out, never shown as 0.
 */
export function scopeLine(copy: Record<string, string>, counts: ScopeCounts): { lead: string; parts: Part[]; text: string } {
  const template =
    counts.obligations === 0
      ? copy.scopeNoCount
      : counts.crypto === 0
        ? copy.scopeNone
        : counts.crypto === 1
          ? copy.scopeOne
          : copy.scopeMany;
  const parts = templateParts(template, { crypto: counts.crypto, obligations: counts.obligations });
  const text = `${copy.scopeLead} ${parts.map((p) => ('mono' in p ? p.mono : p.text)).join('')}`;
  return { lead: copy.scopeLead, parts, text };
}

export interface RulebookLinks {
  profiles: Record<string, string>; // ISO3 of a Member State to its Atlas profile, absolute, for ?in=
  next: { label: string; href: string | null }[]; // Where to go next
}

/**
 * The page's links. The tool links to no Prepare page and no other tool, so it reads the same on
 * a site of its own. Its only links into the Atlas are country profiles, each by its full address
 * and only when the Atlas builds that page: a Member State's profile for "{Country} in the QSC
 * Atlas" (the island shows it for the country in ?in=), and the European Union's under Where to
 * go next. A link whose page is not built is null.
 */
export function rulebookLinks(data: Pick<RulebookData, 'copy' | 'memberStates'>, opts: LoadOptions = {}): RulebookLinks {
  const profile = (iso3: string) => {
    const href = pageHref(`/countries/${iso3.toLowerCase()}`, opts);
    return href ? absoluteUrl(href) : null;
  };
  const profiles: Record<string, string> = {};
  for (const m of data.memberStates) {
    const href = profile(m.iso3);
    if (href) profiles[m.iso3] = href;
  }
  return { profiles, next: [{ label: data.copy.nextEuProfile, href: profile('EUU') }] };
}

/** What the island receives of the articles, the reporting regimes, the obligations and the rules. */
export type IslandData = Pick<RulebookData, 'articles' | 'regimes' | 'obligations' | 'rules'>;

/**
 * The island's data, with the law's own words kept out of a build that may not carry them
 * (sourceWordsInBuild() in src/lib/site/review-build.ts is false in production). Without them an
 * article keeps its paragraph references but not their text, and an obligation keeps its EUR-Lex
 * link but not its verbatim sentence, so the words never reach the HTML. What the island never
 * shows is never sent, in any build: a reporting step's quote, and a scope rule's provenance (its
 * excerpts), of which the island reads only the reason and the article reference. Article
 * references, titles and links always stay.
 */
export function islandData(data: IslandData, sourceWords: boolean): IslandData {
  const regimes = data.regimes.map((r) => ({ ...r, steps: r.steps.map((st) => ({ ...st, quote: '' })) }));
  const rules: ScopeRule[] = data.rules.map((r) => ({ id: r.id, instrument: r.instrument, when: r.when, outcome: r.outcome, reason: r.reason, articleRef: r.articleRef, priority: r.priority }));
  if (sourceWords) return { articles: data.articles, regimes, obligations: data.obligations, rules };
  return {
    articles: data.articles.map((a) => ({ ...a, paragraphs: a.paragraphs.map((p) => ({ ...p, quote: '' })) })),
    regimes,
    obligations: data.obligations.map((o) => ({ ...o, sentence: '' })),
    rules,
  };
}
