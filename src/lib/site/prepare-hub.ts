// qscatlas.org: what the Prepare hub (/prepare) shows (spec 5.1, made shorter on 2 October 2026).
//
// The hub is a front door with little text on it: the section's question as the H1, one
// sentence, the one way into the Readiness Check (the Check itself asks, once, whom the visitor
// answers for: Swann, 4 October 2026), "What the guides ask" as a plain list of the Check's six
// groups (name, one short line, how many questions, a link that starts the Check at that group),
// one link to the guides, and the standing line that a target is not a legal deadline.
//
// Every count is computed here from data/lab/readiness/readiness.json, never written into the
// page. Every visible string comes from data/lab/prepare/hub-copy.json, except the group names
// and lines, which are the Check's own (readiness.json). Every link goes through link() or
// pageHref(), which return null for a page this build does not generate; a heading with nothing
// under it is never drawn. No source's words are shown here, no total, percentage or score is
// computed, and nothing a visitor does here is stored or sent.

import { CopyFileSchema } from '../lab/schema';
import { latestVerifiedAt, loadDataset } from '../lab/load';
import type { LoadOptions } from '../lab/load';
import { DEFAULT_SOURCES, readReadiness } from '../lab/readiness-data';
import type { ReadinessFile } from '../lab/readiness-data';
import type { SourceEntry } from '../lab/format';
import { link, pageHref, shown } from './gates';
import { joinAnd, memo } from './joins';
import { PREPARE_QUESTION } from './routes';

export type { LoadOptions };

const READINESS = 'data/lab/readiness/readiness.json';
const HUB_COPY = 'data/lab/prepare/hub-copy.json';

type Copy = Record<string, string | Record<string, string>>;

// ---- shapes the page renders ------------------------------------------------------------------

export interface Link {
  label: string;
  href: string;
}

/** One group of "What the guides ask". */
export interface HubGroup {
  id: string;
  label: string; // the Check's own name for it, "Discovery"
  description: string; // the Check's own line for it
  count: number; // questions with the guides the Check starts with
  countLabel: string; // "4 questions"
  href: string | null; // the Check, opened at this group
}

export interface HubModel {
  built: boolean; // the hub is generated in this build
  readiness: boolean; // the Check is shown, and with it the way in, the groups and the guides
  h1: string;
  lede: string;
  asOf: string | null | undefined; // undefined: no as-of item at all
  standingNote: string | null;
  start: Link | null; // the one way into the Check, which asks whom the visitor answers for
  groupsHead: string;
  groupsIntro: string;
  groups: HubGroup[];
  guides: Link | null; // the one link to the guides
  others: Link[]; // with the Check hidden: the Prepare tools this build shows
  aboutHead: string;
  methodTool: string | null; // the tool whose methodology section About this section links to
  sources: SourceEntry[];
}

// ---- reading the data -------------------------------------------------------------------------

/** The hub's copy, read once per build mode and state of the file. */
export function hubCopy(opts: LoadOptions = {}): Copy {
  return memo('prepare-hub-copy', [HUB_COPY], opts, () => loadDataset(HUB_COPY, CopyFileSchema, opts).copy);
}

function readiness(opts: LoadOptions): ReadinessFile {
  return memo('prepare-hub-readiness', [READINESS], opts, () => readReadiness(opts));
}

function str(copy: Copy, key: string): string {
  const v = copy[key];
  if (typeof v !== 'string') throw new Error(`hub-copy.json: no string "${key}"`);
  return v;
}

/** "{n} questions" with its values filled in. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Seven, 41: a count as a sentence writes it. */
export function numberWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One reference per document the guides are read from, in file order, for About this section. */
function sourceEntries(file: ReadinessFile): SourceEntry[] {
  const printed = new Map(file.documents.map((d) => [d.url, d.date]));
  const out: SourceEntry[] = [];
  const seen = new Set<string>();
  const ids = new Set(file.frameworks.map((f) => f.id));
  const provs = [
    ...file.frameworks.flatMap((f) => [...f.provenance, ...f.milestones.flatMap((m) => m.provenance)]),
    ...file.actions.filter((a) => ids.has(a.source)).flatMap((a) => a.provenance),
  ];
  for (const p of provs) {
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    out.push({ author: p.publisher ?? p.title ?? p.url, date: printed.get(p.url) ?? null, title: p.title ?? p.url, url: p.url, retrievedAt: p.retrievedAt });
  }
  return out;
}

// ---- the groups -------------------------------------------------------------------------------

/**
 * The six groups of the Check, in its order, each with the number of questions it asks with the
 * guides it starts with (the EU roadmap and the NCSC timelines), and a link that opens the Check
 * at its first question. Empty when the Check is not shown; a group with no question is left out.
 */
export function hubGroups(opts: LoadOptions = {}): HubGroup[] {
  if (!shown('readiness', opts)) return [];
  const file = readiness(opts);
  const copy = hubCopy(opts);
  const ids = new Set(file.frameworks.map((f) => f.id));
  const defaults = DEFAULT_SOURCES.filter((id) => ids.has(id));
  return file.domains
    .map((d) => {
      const count = file.actions.filter((a) => a.domain === d.id && defaults.includes(a.source)).length;
      return {
        id: d.id,
        label: d.label,
        description: d.description,
        count,
        countLabel: count === 1 ? str(copy, 'groupCountOne') : fill(str(copy, 'groupCount'), { n: count }),
        href: link('readiness', { query: { theme: d.id } }, opts),
      };
    })
    .filter((g) => g.count > 0);
}

// ---- the hub ------------------------------------------------------------------------------------

/** Everything the hub at /prepare shows, in its order. */
export function hubModel(opts: LoadOptions = {}): HubModel {
  const copy = hubCopy(opts);
  const built = pageHref('/prepare', opts) !== null;
  const check = built && shown('readiness', opts);
  const base = {
    built,
    readiness: check,
    h1: PREPARE_QUESTION,
    groupsHead: str(copy, 'groupsHead'),
    aboutHead: str(copy, 'aboutHead'),
  };

  if (!check) {
    // the Check hidden: the hub names the Prepare tools this build shows, and nothing else
    const others = built
      ? [
          { label: str(copy, 'otherExposure'), href: link('exposure', {}, opts) },
          { label: str(copy, 'otherDates'), href: link('dates', {}, opts) },
        ].filter((l): l is Link => l.href !== null)
      : [];
    return {
      ...base,
      lede: str(copy, 'hubLedeShort'),
      asOf: undefined,
      standingNote: null,
      start: null,
      groupsIntro: '',
      groups: [],
      guides: null,
      others,
      methodTool: ['exposure', 'dates'].find((id) => link(id, {}, opts) !== null) ?? null,
      sources: [],
    };
  }

  const file = readiness(opts);
  const groups = hubGroups(opts);
  const startHref = link('readiness', {}, opts);
  const short = new Map(file.frameworks.map((f) => [f.id, f.shortLabel]));
  const starts = DEFAULT_SOURCES.filter((id) => short.has(id)).map((id) => `the ${short.get(id)}`);
  const guidesHref = pageHref('/prepare/guides', opts);

  return {
    ...base,
    lede: str(copy, 'hubLede'),
    asOf: latestVerifiedAt(file),
    standingNote: str(copy, 'standingNote'),
    start: startHref ? { label: str(copy, 'start'), href: startHref } : null,
    groupsIntro: fill(str(copy, 'groupsIntro'), { groups: capital(numberWord(groups.length)), guides: joinAnd(starts) }),
    groups,
    guides: guidesHref ? { label: fill(str(copy, 'guidesLink'), { count: numberWord(file.frameworks.length) }), href: guidesHref } : null,
    others: [],
    methodTool: 'readiness',
    sources: sourceEntries(file),
  };
}
