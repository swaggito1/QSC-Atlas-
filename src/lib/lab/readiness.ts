// QSC Atlas: the Readiness Check's logic, shared by the island, the loader and the tests.
// Pure functions only (no Node or DOM imports), so the browser bundle stays small.
//
// The Check is a guided self-assessment: one question per action, group by group, each answered
// Done, In progress, Not started or Not applicable. The visitor's answers live only in the page
// and in its address after the # sign, a part browsers never send to a server. The query
// (?action=, ?theme=, ?start=entry, ?as=, ?view=) only says where a link opens; the page reads it once
// and never writes it. Nothing here adds answers up across groups: there is no score,
// percentage, ranking or overall reading, by design. Counts are per group, of the visitor's own
// answers.

export const ANSWERS = ['done', 'in-progress', 'not-started', 'not-applicable'] as const;
export type Answer = (typeof ANSWERS)[number];

// One letter per answer in the fragment: #f=...&d=...&u=...&n=...&x=...&r=...
// "u" was "under way" before October 2026 and reads back as in progress. The old "q" (not sure)
// is no longer an answer: a link that carries it opens those questions unanswered.
const ANSWER_KEYS: Record<Answer, string> = { done: 'd', 'in-progress': 'u', 'not-started': 'n', 'not-applicable': 'x' };

/** Who the visitor answers for: optional, and only ever said by the visitor. */
export const ROLES = ['organisation', 'public-administration'] as const;
export type Role = (typeof ROLES)[number];
const ROLE_KEYS: Record<Role, string> = { organisation: 'o', 'public-administration': 'p' };

export interface Posture {
  key: string;
  label: string;
  short: string;
  color: string;
}

/** Where a statement comes from. The excerpt is left out of every build that may not carry source words. */
export interface RdProvenance {
  url: string;
  title?: string;
  publisher?: string;
  retrievedAt: string;
  excerpt?: string;
  locator?: string;
}

export interface RdMilestone {
  id: string;
  year: number;
  month: number | null;
  label: string;
  kind: string;
  recurs?: 'yearly' | null; // a deliverable the source asks for again every year from this date
  provenance: RdProvenance[];
}

export interface RdFramework {
  id: string;
  label: string;
  shortLabel: string;
  issuer: string;
  jurisdiction: string;
  status: string;
  bindingness: string;
  statusLabel: string; // "published"
  bindingnessLabel: string; // "soft law", "guidance"
  published: string | null; // ISO date printed on the source document, when it carries one
  audience: string;
  posture: Posture | null;
  milestones: RdMilestone[];
  verified: boolean;
}

export interface RdAction {
  id: string;
  domain: string;
  source: string;
  label: string;
  description: string;
  audienceNote: string | null;
  dueBy: { framework: string; milestone: string }[];
  provenance: RdProvenance[];
  verified: boolean;
}

export interface RdDomain {
  id: string;
  label: string;
  description: string;
}

export interface RdState {
  chosen: string[]; // framework ids, in data order
  answers: Record<string, Answer>; // action id to answer; an absent id is not answered yet
  role: Role | null;
}

// ---- dates -------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A sortable month index. A year with no month counts from its first month ("from 2030"). */
export function milestoneOrder(m: Pick<RdMilestone, 'year' | 'month'>): number {
  return m.year * 12 + (m.month ?? 1) - 1;
}

/** The short mono label: "end 2026", "Apr 2026", "2028". */
export function milestoneShort(m: Pick<RdMilestone, 'year' | 'month'>): string {
  if (m.month === 12) return `end ${m.year}`;
  if (m.month) return `${MONTHS[m.month - 1].slice(0, 3)} ${m.year}`;
  return String(m.year);
}

/** The phrase in a sentence: "at the end of 2026", "in April 2026", "in 2028". */
export function milestoneWhen(m: Pick<RdMilestone, 'year' | 'month'>): string {
  if (m.month === 12) return `at the end of ${m.year}`;
  if (m.month) return `in ${MONTHS[m.month - 1]} ${m.year}`;
  return `in ${m.year}`;
}

/** The target as a line writes it: "end 2026", or "every year from Apr 2026". */
export function milestoneDue(m: Pick<RdMilestone, 'year' | 'month' | 'recurs'>): string {
  return m.recurs === 'yearly' ? `every year from ${milestoneShort(m)}` : milestoneShort(m);
}

/** Fill {name} placeholders. Unknown names are left as they are, so a gap shows in review. */
export function fillIn(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

// ---- the questions -------------------------------------------------------------------

/** Actions whose source the visitor chose, in data order. */
export function actionsFor(actions: RdAction[], chosen: string[]): RdAction[] {
  return actions.filter((a) => chosen.includes(a.source));
}

/**
 * The questions the visitor answers: one per action of a chosen guide, group by group in the
 * order of the groups, and in data order inside a group.
 */
export function questionsFor(actions: RdAction[], domains: Pick<RdDomain, 'id'>[], chosen: string[]): RdAction[] {
  const order = new Map(domains.map((d, i) => [d.id, i]));
  return actionsFor(actions, chosen)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (order.get(x.a.domain) ?? order.size) - (order.get(y.a.domain) ?? order.size) || x.i - y.i)
    .map((x) => x.a);
}

/** Where a question sits in its group: "Discovery, question 3 of 4" is { n: 3, of: 4 }. */
export function positionIn(questions: RdAction[], index: number): { group: string; n: number; of: number } | null {
  const q = questions[index];
  if (!q) return null;
  const same = questions.filter((x) => x.domain === q.domain);
  return { group: q.domain, n: same.indexOf(q) + 1, of: same.length };
}

/** The first question of a group, or null when no chosen guide asks anything under it. */
export function firstOfGroup(questions: RdAction[], group: string): RdAction | null {
  return questions.find((q) => q.domain === group) ?? null;
}

/** Where to open when nothing says where: the first question not answered yet, else null (all answered). */
export function firstUnanswered(questions: RdAction[], answers: Record<string, Answer>): RdAction | null {
  return questions.find((q) => !answers[q.id]) ?? null;
}

// ---- targets -------------------------------------------------------------------

/** The due references of an action that point at a chosen framework. */
export function chosenDue(action: RdAction, chosen: string[]) {
  return action.dueBy.filter((d) => chosen.includes(d.framework));
}

export interface TargetPoint {
  framework: RdFramework;
  milestone: RdMilestone;
}

/**
 * The earliest target the chosen guides set for an action: its own guide's, or another chosen
 * guide's whose milestone names the same step. Ties keep the action's own guide first, then the
 * order of the guides. Null when no chosen guide dates it.
 */
export function earliestTarget(action: RdAction, frameworks: RdFramework[], chosen: string[]): TargetPoint | null {
  const rank = new Map(frameworks.map((f, i) => [f.id, i]));
  const points: TargetPoint[] = [];
  for (const d of chosenDue(action, chosen)) {
    const f = frameworks.find((x) => x.id === d.framework);
    const m = f?.milestones.find((x) => x.id === d.milestone);
    if (f && m) points.push({ framework: f, milestone: m });
  }
  const own = (p: TargetPoint) => (p.framework.id === action.source ? 0 : 1);
  points.sort(
    (a, b) =>
      milestoneOrder(a.milestone) - milestoneOrder(b.milestone) || own(a) - own(b) || (rank.get(a.framework.id) ?? 0) - (rank.get(b.framework.id) ?? 0),
  );
  return points[0] ?? null;
}

/**
 * The target line of one action: its own source's dates first, without naming the source again,
 * then that source's bindingness, so a date read alone never passes for a deadline, then any other
 * chosen source whose milestone names the same step. "target end 2026 · soft law",
 * "target 2031 · guidance · also end 2031 in the Canadian roadmap", "every year from Apr 2026 · guidance".
 */
export function targetLine(action: RdAction, frameworks: RdFramework[], chosen: string[], copy: Record<string, any>): string {
  const own: RdMilestone[] = [];
  const others = new Map<string, string[]>();
  for (const d of chosenDue(action, chosen)) {
    const f = frameworks.find((x) => x.id === d.framework);
    const m = f?.milestones.find((x) => x.id === d.milestone);
    if (!f || !m) continue;
    if (f.id === action.source) own.push(m);
    else others.set(f.shortLabel, [...(others.get(f.shortLabel) ?? []), milestoneDue(m)]);
  }
  const parts: string[] = [];
  const plain = own.filter((m) => !m.recurs).map(milestoneShort);
  if (plain.length) parts.push(fillIn(copy.targetBy, { dates: plain.join(' and ') }));
  for (const m of own.filter((x) => x.recurs)) parts.push(milestoneDue(m));
  const binding = frameworks.find((x) => x.id === action.source)?.bindingnessLabel;
  if (parts.length && binding) parts.push(binding);
  for (const [source, dates] of others) parts.push(fillIn(copy.targetAlso, { dates: dates.join(' and '), source }));
  return parts.length ? parts.join(' · ') : copy.targetNone;
}

// ---- the assessment -------------------------------------------------------------------

export interface NextStep {
  action: RdAction;
  answer: Answer;
  target: TargetPoint | null;
}

/**
 * What to take first: the questions the visitor marked in progress or not started, the earliest
 * target among their chosen guides first, then those with no target date. Among equals, what is
 * already in progress comes before what has not started, then the order of the questions. The
 * rule is written on the page beside the list; nothing is weighed or scored.
 */
export function nextSteps(questions: RdAction[], answers: Record<string, Answer>, frameworks: RdFramework[], chosen: string[], limit = 3): NextStep[] {
  const open: Answer[] = ['in-progress', 'not-started'];
  return questions
    .map((action, i) => ({ action, i, answer: answers[action.id], target: earliestTarget(action, frameworks, chosen) }))
    .filter((x): x is typeof x & { answer: Answer } => Boolean(x.answer) && open.includes(x.answer))
    .sort((a, b) => {
      const ta = a.target ? milestoneOrder(a.target.milestone) : Infinity;
      const tb = b.target ? milestoneOrder(b.target.milestone) : Infinity;
      if (ta !== tb) return ta - tb;
      return open.indexOf(a.answer) - open.indexOf(b.answer) || a.i - b.i;
    })
    .slice(0, limit)
    .map(({ action, answer, target }) => ({ action, answer, target }));
}

export interface GroupSummary {
  id: string;
  label: string;
  questions: RdAction[];
  byAnswer: Record<Answer, RdAction[]>;
  unanswered: RdAction[];
}

/** Each group's questions sorted by the visitor's answer, in question order. Groups with no question are left out. */
export function groupSummaries(questions: RdAction[], answers: Record<string, Answer>, domains: RdDomain[]): GroupSummary[] {
  return domains
    .map((d) => {
      const qs = questions.filter((q) => q.domain === d.id);
      const byAnswer = Object.fromEntries(ANSWERS.map((a) => [a, qs.filter((q) => answers[q.id] === a)])) as Record<Answer, RdAction[]>;
      return { id: d.id, label: d.label, questions: qs, byAnswer, unanswered: qs.filter((q) => !answers[q.id]) };
    })
    .filter((g) => g.questions.length > 0);
}

// ---- the fragment ------------------------------------------------------------

/** "f=eu-roadmap,ncsc-timelines&d=eu-inventory&u=ncsc-plan&r=o": guides, one list per answer, then the role. */
export function encodeState(state: RdState): string {
  const parts = [`f=${state.chosen.join(',')}`];
  for (const a of ANSWERS) {
    const ids = Object.keys(state.answers).filter((id) => state.answers[id] === a).sort();
    if (ids.length) parts.push(`${ANSWER_KEYS[a]}=${ids.join(',')}`);
  }
  if (state.role) parts.push(`r=${ROLE_KEYS[state.role]}`);
  return parts.join('&');
}

/** decodeURIComponent that gives null for a broken escape such as "%" or "%2" instead of throwing. */
function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/**
 * Read a fragment back. Unknown framework or action ids are dropped, so an old link never breaks
 * the page, and so is any pair with a broken percent escape. With no usable "f=" the default
 * guides are used. Returns null for a fragment that is not the Check's.
 */
export function decodeState(hash: string, known: { frameworks: string[]; actions: string[] }, defaults: string[]): RdState | null {
  const raw = hash.replace(/^#/, '');
  if (!raw || !/(^|&)(f|d|u|n|x|q|r)=/.test(raw)) return null;
  const params = new Map<string, string>();
  for (const pair of raw.split('&')) {
    const i = pair.indexOf('=');
    if (i <= 0) continue;
    const value = safeDecode(pair.slice(i + 1));
    if (value !== null) params.set(pair.slice(0, i), value);
  }
  const list = (k: string) => (params.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const fromHash = params.has('f') ? known.frameworks.filter((id) => list('f').includes(id)) : null;
  const chosen = fromHash ?? defaults.filter((id) => known.frameworks.includes(id));
  const answers: Record<string, Answer> = {};
  for (const a of ANSWERS) for (const id of list(ANSWER_KEYS[a])) if (known.actions.includes(id)) answers[id] = a;
  const r = params.get('r');
  const role = ROLES.find((x) => ROLE_KEYS[x] === r) ?? null;
  return { chosen, answers, role };
}

// ---- links into the page: ?action=, ?theme=, ?start=entry and ?as= -------------------------------

/** Where a link into the Check opens: one question, or the first question of one group. */
export interface RdLanding {
  kind: 'action' | 'group';
  id: string; // the action id or the group (domain) id
  source: string | null; // a guide the landing needs chosen: the action's own
}

/**
 * Read a landing from the query string: ?action= first, then ?theme= (or ?group=), then
 * ?start=entry, which opens the question that asks whether you are an urgent adopter. Unknown
 * values are ignored. The page reads the query once on load and never writes it, so the answers,
 * which live in the hash, never meet it.
 */
export function readLanding(
  search: string,
  known: { domains: string[]; actions: { id: string; source: string }[]; entryAction: string | null },
): RdLanding | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const byId = (id: string | null) => (id ? known.actions.find((a) => a.id === id) : undefined);
  const action = byId(params.get('action'));
  if (action) return { kind: 'action', id: action.id, source: action.source };
  const group = params.get('theme') ?? params.get('group');
  if (group && known.domains.includes(group)) return { kind: 'group', id: group, source: null };
  const entry = params.get('start') === 'entry' ? byId(known.entryAction) : undefined;
  if (entry) return { kind: 'action', id: entry.id, source: entry.source };
  return null;
}

/** The role a link says, ?as=organisation or ?as=public-administration; null otherwise. */
export function readRole(search: string): Role | null {
  try {
    const as = new URLSearchParams(search).get('as');
    return ROLES.find((r) => r === as) ?? null;
  } catch {
    return null;
  }
}

/** The view a link asks for, ?view=list (every question as a checklist) or ?view=assessment; null otherwise. */
export function readView(search: string): 'list' | 'assessment' | null {
  try {
    const v = new URLSearchParams(search).get('view');
    return v === 'list' || v === 'assessment' ? v : null;
  } catch {
    return null;
  }
}

/** The chosen guides with one more added, in data order; unchanged when it is already chosen or unknown. */
export function withSource(chosen: string[], source: string | null, order: string[]): string[] {
  if (!source || chosen.includes(source) || !order.includes(source)) return chosen;
  return order.filter((id) => id === source || chosen.includes(id));
}

// ---- links out of the page: each action's element -------------------------------------------

/** A link from an action to the page that does its job, computed at build time for shown pages only. */
export interface RdElementLink {
  href: string;
  label: string;
  carriesSources: boolean; // the supplier letter opens with the guides chosen here, as ?f=
}

/** The element's address; the supplier letter's carries the chosen guides as ?f=, read at run time. */
export function elementHref(link: Pick<RdElementLink, 'href' | 'carriesSources'>, chosen: string[]): string {
  if (!link.carriesSources || !chosen.length) return link.href;
  const hashAt = link.href.indexOf('#');
  const base = hashAt >= 0 ? link.href.slice(0, hashAt) : link.href;
  const hash = hashAt >= 0 ? link.href.slice(hashAt) : '';
  const params = base.includes('?') ? base.slice(base.indexOf('?') + 1).split('&').filter((p) => p && !p.startsWith('f=')) : [];
  const path = base.includes('?') ? base.slice(0, base.indexOf('?')) : base;
  const f = `f=${chosen.map((id) => encodeURIComponent(id)).join(',')}`;
  return `${path}?${[...params, f].join('&')}${hash}`;
}

// ---- CSV -------------------------------------------------------------------------

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** RFC 4180 text with CRLF line ends and a byte-order mark, so spreadsheet programs read the accents. */
export function toCsv(rows: string[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
