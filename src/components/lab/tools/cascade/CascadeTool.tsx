// QSC Atlas: the Standards Cascade island. It holds the view state (kept in the query string),
// works out what a frame draws and what it states, and hands that frame to one of three views:
// the orbit (positions from the build), the globe and the map (country shapes loaded in the
// browser). Colour is the posture only; marker shape on the orbit is the standards role, named
// only inside the role badge; a line is a country's documents of one kind, its weight their
// number. The Show checkboxes choose the lines; the sentences and the colours always count every
// kind of document. "Draw as" is the kit's text tabs, kept for views; Group and Show are the
// kit's plain choice control (radios and checkboxes). At every width the group, show and
// standard controls and the fork view wait behind one quiet "Choose what to show" disclosure,
// so "Draw as" and the chart come first (a link that names a narrowed view opens it). Under
// 1100px, once a country is chosen its documents follow the chart, before the time line, and
// are scrolled into view at once (never glided). Every link the panel offers (a
// profile, a country's documents, a document's Atlas record) arrives as a prop, built at build
// time: the island holds no route of its own.
//
// Time moves only by hand: the slider, its arrow keys and Page Up and Page Down. There is no
// playback, and no line draws itself on (Swann, 2 October 2026). A document's own words are for
// review, not for visitors: the panel shows them only when the build carries them
// (sourceWordsAvailable) and the page was opened with ?review=1 (src/lib/site/review.ts), set as
// the kit's quotation (no left rule); the document's name, date and links always show. A link
// every row carries (a document's two, each table row's source) is an index link (.row-link):
// ink words on a thin teal underline, so the panel and the tables keep one teal mass.
//
// The standards body (Swann, 5 October 2026). NIST is the default, and the island's own props are
// its view, drawn exactly as before. "Standards body", a select inside the disclosure, chooses
// another body the Standards overview groups. The options come as a prop; each body's view, built
// at build time, waits in the page as JSON (index.astro, #cc-bodies) and is read once in the
// browser, so the NIST view's props and its first paint stay as they were. The choice is kept in
// the address (?body=etsi, none for NIST) beside the other choices. Another body's view
// has no seat on the globe or the map, so no line is drawn there and only the citing countries
// are coloured; the national processes, the fork view and the Own process lines stay in the NIST
// view. The page's own words above the island (the question, the lede, the meta line, the note on
// the targeted reading, the method and the sources) follow the choice through the "cc:body"
// event (index.astro).

import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { POSTURE_META, POSTURE_ORDER, ROLE_ORDER } from '../../../../lib/process';
import { LINK_ALPHA, RELATIONS, aggregateLinks, byDate, cascadeStateToSearch, counterLines, counterLinesBody, documentEvidence, drawnEdges, forkSet, frameFacts, linkWidth, monthLabel, monthOf, months, onOrBefore, parseCascadeState } from '../../../../lib/lab/cascade';
import type { CascadeState, LinkKind, RelationFilter } from '../../../../lib/lab/cascade';
import type { CascadeData, CascadeEdgeView, CascadeIslandBodies } from '../../../../lib/lab/cascade-data';
import type { CascadeBodyOption, CascadeCountryLinks } from '../../../../lib/site/standards';
import { fill } from '../../../../lib/lab/exposure';
import { formatDate } from '../../../../lib/lab/format';
import { REVIEW_PARAM, reviewRequested } from '../../../../lib/site/review';
import ShareBar from '../../ShareBar';
import CascadeOrbit from './CascadeOrbit';
import CascadeGlobe from './CascadeGlobe';
import CascadeMap from './CascadeMap';
import { Marker, RoleBadge } from './parts';
import type { Frame, TipData } from './parts';

// one failing view never blanks the whole tool: the orbit and the table carry the same lines
class StageBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type Props = Omit<CascadeData, 'sources' | 'asOf' | 'corpusSize' | 'lineDocs'> & {
  asOfLabel: string;
  // built at build time (src/lib/site/standards.ts cascadeLinks): null where a page is not built
  links: { countries: Record<string, CascadeCountryLinks>; records: Record<string, string> };
  // sourceWordsInBuild() on the server: false in production, whose edges carry no excerpt at all
  sourceWordsAvailable?: boolean;
  // the standards bodies on offer, NIST first (cascadeIslandBodies): absent, the island shows NIST alone
  bodyOptions?: CascadeBodyOption[];
};

// the other bodies' views, as the page carries them (index.astro): the island reads them once mounted
type BodyViews = Omit<CascadeIslandBodies, 'options'>;
export const BODIES_ID = 'cc-bodies';
function readBodies(): BodyViews | null {
  try {
    const el = document.getElementById(BODIES_ID);
    return el?.textContent ? (JSON.parse(el.textContent) as BodyViews) : null;
  } catch {
    return null;
  }
}

// the controls the "Choose what to show" disclosure folds: body, group, show, standard and fork
// (the fork view is NIST's only, so another body's view folds four)
const FOLDED = 5;
// the event the page's own words above the island follow (index.astro)
const BODY_EVENT = 'cc:body';

// The address is rewritten at most once in this many milliseconds, the last change always
// written. Safari refuses a hundredth history write within 30 seconds (Firefox a similar
// burst) by throwing, and an error thrown in an effect takes the whole island down; a drag
// along the time slider passes a month at every step.
const URL_GAP = 400;
// the address is read before the first live paint, so a shared link opens on its own view (on
// the server, where there is no address, a plain effect that never runs)
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const VIEWS = ['orbit', 'globe', 'map'] as const;
const GROUPS = ['all', 'eu', 'nato'] as const;
// the Show checkboxes in the key's order: names, adopts, adds requirements, own process (the
// state keeps RELATIONS order, so a link reads the same whichever way they were ticked)
const SHOW_ORDER: readonly RelationFilter[] = ['references', 'adopts', 'profiles', 'fork'];
const REL_PHRASE: Record<string, string> = {
  adopts: 'relPhraseAdopts',
  references: 'relPhraseReferences',
  profiles: 'relPhraseProfiles',
  participates: 'relPhraseParticipates',
  fork: 'relPhraseFork',
  'parallel-interoperable': 'relPhraseParallel',
};

/** A short sample of a line, drawn as the chart draws it; a line to a national standard ends in its square. */
function LineSample({ kind, docs = 1, pre = false }: { kind: LinkKind; docs?: number; pre?: boolean }) {
  return (
    <svg viewBox="0 0 40 10" aria-hidden="true" className="cc-key-line">
      <path
        d={kind === 'own' ? 'M2 5 H31' : 'M2 5 H38'}
        className={`cc-link cc-link--${kind}${pre ? ' is-pre' : ''}${kind === 'lead' ? ' is-lead' : ''}`}
        style={{ strokeWidth: linkWidth(docs), strokeOpacity: kind === 'lead' ? undefined : LINK_ALPHA[kind] }}
      />
      {kind === 'own' && <rect x={31.5} y={1.5} width={7} height={7} className="cc-key-square" />}
    </svg>
  );
}

/** A switch: the label beside a column of options, so options that wrap stay under the first. */
function Switch({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="lab-switch cc-switch" role="group" aria-label={label}>
      <span className="lbl" aria-hidden="true">
        {label}
      </span>
      <span className="cc-opts">{children}</span>
    </div>
  );
}

/** The kit's quiet choice control (lab.css .lab-choice): radios or checkboxes, named by their label. */
function Choices({ id, label, radio = false, children }: { id: string; label: string; radio?: boolean; children: ReactNode }) {
  return (
    <div className="cc-choices" role={radio ? 'radiogroup' : 'group'} aria-labelledby={id}>
      <span className="lbl" id={id}>
        {label}
      </span>
      <span className="lab-choice cc-opts">{children}</span>
    </div>
  );
}

export default function CascadeTool(props: Props) {
  const { copy, groups, asOfLabel, links, sourceWordsAvailable = false } = props;
  const DEFAULTS: CascadeState = useMemo(() => ({ view: 'orbit', std: 'all', rel: [...RELATIONS], group: 'all', t: props.endMonth, fork: false, sel: null }), [props.endMonth]);
  const [st, setSt] = useState<CascadeState>(DEFAULTS);

  // ---- the standards body: NIST's view is the props, another body's comes from the page's JSON ----
  const [bodies, setBodies] = useState<BodyViews | null>(null);
  // the choice is drawn from the build's list, so the first paint already has it; the views
  // themselves arrive with the island (a body whose view is missing is never switched to)
  const bodyOptions = props.bodyOptions ?? [];
  const edgePool = useMemo(() => new Map([...props.edges, ...(bodies?.extraEdges ?? [])].map((e) => [e.id, e])), [props.edges, bodies]);
  const viewOf = (id: string | undefined, from: BodyViews | null = bodies) => {
    const alt = id && id !== 'nist' ? from?.views[id] : undefined;
    const pool = from === bodies ? edgePool : new Map([...props.edges, ...(from?.extraEdges ?? [])].map((e) => [e.id, e]));
    if (!alt) return { id: 'nist', nist: true, orbit: props.orbit, geo: props.geo, edges: props.edges, info: props.info, standards: props.standards, nistIds: props.nistIds, spine: props.spine, endMonth: props.endMonth, asOfLabel };
    return {
      id: id as string,
      nist: false,
      orbit: alt.orbit,
      geo: alt.geo,
      edges: alt.edgeIds.map((e) => pool.get(e)).filter((e): e is CascadeEdgeView => Boolean(e)),
      info: { ...props.info, ...from?.extraInfo },
      standards: alt.standards,
      nistIds: alt.nistIds,
      spine: alt.spine,
      endMonth: alt.endMonth,
      asOfLabel: alt.asOf ? formatDate(alt.asOf) : '',
    };
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => viewOf(st.body), [st.body, props, bodies, edgePool]);
  const { orbit, geo, edges, info, standards, nistIds, spine, endMonth } = view;
  const isNist = view.nist;
  const body = bodyOptions.find((o) => o.id === view.id) ?? null;
  const bodyVars = { body: body?.labelOr ?? '' };
  const allMonths = useMemo(() => months(endMonth), [endMonth]);
  const [ready, setReady] = useState(false);
  const [showWords, setShowWords] = useState(false); // a document's own words: review only, set after mount
  const [announce, setAnnounce] = useState(''); // one short line for a screen reader, after a choice
  const [folded, setFolded] = useState(true); // "Choose what to show", folded unless a link names a narrowed view
  const pickRef = useRef<HTMLSelectElement>(null); // the jurisdiction select: focus returns here when the panel closes
  const panelRef = useRef<HTMLHeadingElement>(null); // the chosen country's name, at the head of its documents
  const chose = useRef(false); // the visitor has just chosen a country (not a link that opened on one)

  const atlas = useMemo(() => new Set(orbit.nodes.map((n) => n.iso3)), [orbit]);
  const nodeOf = useMemo(() => new Map(orbit.nodes.map((n) => [n.iso3, n])), [orbit]);
  const stdOf = useMemo(() => new Map(standards.map((s) => [s.id, s])), [standards]);
  const centreStandards = useMemo(() => standards.filter((s) => s.centre), [standards]);
  const centreIds = useMemo(() => new Set(centreStandards.map((s) => s.id)), [centreStandards]);
  const nationalIds = useMemo(() => new Set(standards.filter((s) => s.national).map((s) => s.id)), [standards]);
  const allLinks = useMemo(() => aggregateLinks(edges, centreIds, nationalIds), [edges, centreIds, nationalIds]);
  const maxDocs = useMemo(() => Math.max(1, ...allLinks.map((l) => l.docs)), [allLinks]);
  const hasLeads = edges.some((e) => !e.verified);

  useIsoLayoutEffect(() => {
    // the body first: the months, the standards and the countries a link may name are that body's
    const more = (props.bodyOptions?.length ?? 0) > 1 ? readBodies() : null;
    setBodies(more);
    // an address may name a body by any of its ids (?body=irtf opens the IETF and IRTF)
    const asked = new URLSearchParams(window.location.search).get('body')?.trim().toLowerCase() ?? '';
    const option = (props.bodyOptions ?? []).find((o) => o.id === asked || o.bodyIds.includes(asked));
    const bodyId = option && option.id !== 'nist' && more?.views[option.id] ? option.id : 'nist';
    const v = viewOf(bodyId, more);
    const defaults = { ...DEFAULTS, t: v.endMonth };
    const parsed = parseCascadeState(window.location.search, defaults, months(v.endMonth));
    if (bodyId === 'nist') delete parsed.body;
    else parsed.body = bodyId;
    const centre = new Set(v.standards.filter((s) => s.centre).map((s) => s.id));
    if (parsed.std !== 'all' && !centre.has(parsed.std)) parsed.std = 'all';
    if (parsed.sel && !v.orbit.nodes.some((n) => n.iso3 === parsed.sel)) parsed.sel = null;
    if (!v.nist) parsed.fork = false;
    setSt(parsed);
    // a link that narrows the view opens the controls that narrow it, so its state is in sight
    if (!v.nist || parsed.group !== DEFAULTS.group || parsed.std !== DEFAULTS.std || parsed.fork || parsed.rel.length !== DEFAULTS.rel.length) setFolded(false);
    // the page's own words follow the body (index.astro); NIST's are the page's as built
    if (!v.nist) document.dispatchEvent(new CustomEvent(BODY_EVENT, { detail: bodyId }));
    // after mount, so the server's render and the first one in the browser agree
    setShowWords(sourceWordsAvailable && reviewRequested());
    setReady(true);
    // read once, when the island mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const urlTimer = useRef(0);
  const urlWritten = useRef(0);
  useEffect(() => {
    if (!ready) return;
    const write = () => {
      // a review link (?review=1) stays one while the view changes, so a reload keeps the source's words
      const review = reviewRequested() ? `&${REVIEW_PARAM}=1` : '';
      const url = window.location.pathname + cascadeStateToSearch(st, DEFAULTS) + review + window.location.hash;
      if (url === window.location.pathname + window.location.search + window.location.hash) return;
      urlWritten.current = Date.now();
      try {
        window.history.replaceState(null, '', url);
      } catch {
        /* the browser refused this write; the next change writes the address again */
      }
    };
    const wait = URL_GAP - (Date.now() - urlWritten.current);
    if (wait <= 0) write();
    else urlTimer.current = window.setTimeout(write, wait);
    return () => window.clearTimeout(urlTimer.current);
  }, [st, ready, DEFAULTS]);

  /** A standard's name, with its lifecycle status when it is not a final standard (NIST's words, so NIST's view only). */
  const stdNamed = (id: string) => {
    const s = stdOf.get(id);
    if (!s) return id;
    if (!isNist) return s.label;
    const status = s.status === 'selected' ? copy.statusSelected : s.status === 'draft' ? copy.statusDraft : null;
    if (!status) return s.label;
    return s.label.endsWith(')') ? `${s.label.slice(0, -1)}; ${status})` : `${s.label} (${status})`;
  };

  const set = (patch: Partial<CascadeState>) => setSt((s) => ({ ...s, ...patch }));
  /**
   * Another standards body: its own standards (the choice of standard starts again at all of
   * them), the month kept where that body's time line has it (the latest month moves to that
   * body's latest), the country kept where it is drawn, and no fork view outside NIST's.
   */
  const setBody = (id: string) => {
    if (id !== 'nist' && !bodies?.views[id]) return;
    const next = viewOf(id);
    const nextMonths = months(next.endMonth);
    setSt((s) => {
      const { body: _was, ...rest } = s;
      return {
        ...rest,
        ...(next.nist ? {} : { body: next.id }),
        std: 'all',
        fork: next.nist ? s.fork : false,
        t: s.t === endMonth || !nextMonths.includes(s.t) ? next.endMonth : s.t,
        sel: s.sel && next.orbit.nodes.some((n) => n.iso3 === s.sel) ? s.sel : null,
      };
    });
    document.dispatchEvent(new CustomEvent(BODY_EVENT, { detail: next.id }));
  };
  const setTime = (t: string) => set({ t });
  const docCount = (iso: string) => new Set(edges.filter((e) => e.from === iso).map((e) => e.documentUrl)).size;
  const select = (iso: string | null) => {
    // a click on the sea or on a country outside the Cascade, with nothing selected, changes
    // nothing and announces nothing
    if (iso === st.sel) return;
    set({ sel: iso });
    chose.current = Boolean(iso);
    if (!iso) {
      setAnnounce(copy.announceCleared);
      return;
    }
    const n = docCount(iso);
    setAnnounce(fill(copy.announceSelected, { name: info[iso]?.name ?? iso, docs: n === 0 ? copy.docsNone : n === 1 ? copy.docsOne : fill(copy.docsMany, { n }) }));
  };
  const toggle = (iso: string) => select(st.sel === iso ? null : iso);
  // below 1100px the documents follow the chart; when the visitor chooses a country and its name
  // is low on the screen or off it, bring it up to the middle at once, with no glide, so the
  // choice and its evidence are seen together. Focus stays where the choice was made.
  useEffect(() => {
    if (!chose.current || !st.sel) return;
    chose.current = false;
    const head = panelRef.current;
    if (!head || !window.matchMedia('(max-width: 1100px)').matches) return;
    const r = head.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.7) head.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  }, [st.sel]);
  const monthIndex = allMonths.indexOf(st.t);

  // ---- the frame --------------------------------------------------------------------------------
  const groupSet = useMemo(() => (st.group === 'eu' ? new Set(groups.eu) : st.group === 'nato' ? new Set(groups.nato) : null), [st.group, groups]);
  const forkNodes = useMemo(() => forkSet({ roles: orbit.nodes, spine, edges, t: st.t }), [orbit, spine, edges, st.t]);
  const visible = useMemo(() => drawnEdges(edges, { rel: st.rel, std: st.std, group: groupSet, t: st.t }), [edges, st.rel, st.std, groupSet, st.t]);
  const facts = useMemo(() => frameFacts(edges, st.t, st.std, nistIds, groupSet), [edges, st.t, st.std, nistIds, groupSet]);
  const frame: Frame = useMemo(() => {
    const now = new Map(aggregateLinks(visible, centreIds, nationalIds).map((l) => [l.key, l]));
    return {
      links: allLinks.map((l) => {
        const v = now.get(l.key);
        return { ...l, docs: v?.docs ?? 0, pre: v?.pre ?? l.pre, dim: (st.fork && l.kind !== 'own') || (!!st.sel && l.from !== st.sel) };
      }),
      lit: facts.lit,
      faded: new Set(orbit.nodes.filter((n) => (groupSet && !groupSet.has(n.iso3)) || (st.fork && !forkNodes.has(n.iso3))).map((n) => n.iso3)),
      sel: st.sel,
      fork: st.fork,
      forkNodes,
    };
  }, [visible, facts, allLinks, centreIds, nationalIds, st.fork, st.sel, groupSet, forkNodes, orbit]);
  const active = useMemo(() => new Set(frame.links.filter((l) => l.docs > 0).map((l) => l.from)), [frame]);
  const nodeFaded = useMemo(() => new Set(orbit.nodes.filter((n) => frame.faded.has(n.iso3) || (st.sel !== null && st.sel !== n.iso3 && !active.has(n.iso3))).map((n) => n.iso3)), [orbit, frame, st.sel, active]);

  // ---- what the frame states ---------------------------------------------------------------------
  const c = facts.counts;
  const month = monthLabel(st.t);
  const standardPhrase = st.std === 'all' ? (isNist ? copy.counterAnyStandard : fill(copy.counterAnyBody, bodyVars)) : stdNamed(st.std);
  const [line1, line2] = (isNist ? counterLines : counterLinesBody)(c, copy, { month, standard: standardPhrase });
  const statement = [line1, line2].filter(Boolean).join(' ');
  const descVars = { n: c.n, k: c.k, month };
  // from the lines actually drawn: an edge to another body's standard passes the filters but
  // draws no line
  const noLines = edges.length > 0 && active.size === 0;
  // the words the three views read for themselves: another body's arc and globe label
  const viewCopy = useMemo(
    () => (isNist ? copy : { ...copy, noNist: fill(copy.noBody, bodyVars), globeLabel: fill(copy.globeLabelBody, bodyVars) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isNist, copy, bodyVars.body],
  );

  // the tooltip's line is words in the interface face with the date alone in mono ("first 3 March 2024")
  const tipFor = (iso: string): TipData => {
    const i = info[iso];
    const first = nodeOf.get(iso)?.firstNistEdge;
    const [before, after = ''] = copy.tipFirst.split('{date}');
    const line = first ? (
      <>
        {before}
        <span className="mono">{formatDate(first)}</span>
        {after}
      </>
    ) : (
      viewCopy.noNist
    );
    return { name: i?.name ?? iso, color: i?.postureColor ?? null, short: i?.postureShort ?? copy.noPostureShort, line };
  };
  const ariaFor = (iso: string) => {
    const i = info[iso];
    const first = nodeOf.get(iso)?.firstNistEdge;
    const said = isNist
      ? first
        ? fill(copy.tooltipFirst, { date: formatDate(first) })
        : copy.tooltipNone
      : first
        ? fill(copy.tooltipFirstBody, { ...bodyVars, date: formatDate(first) })
        : fill(copy.tooltipNoneBody, bodyVars);
    return `${i?.name ?? iso}. ${i?.postureLabel ?? copy.noPosture}. ${said}.`;
  };

  // ---- the selected jurisdiction's documents -----------------------------------------------------
  const selected = st.sel ? info[st.sel] ?? null : null;
  const selectedEdges = useMemo(() => (st.sel ? edges.filter((e) => e.from === st.sel) : []), [edges, st.sel]);
  const selectedDocs = useMemo(() => documentEvidence(selectedEdges), [selectedEdges]);
  const joinList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')}${copy.listAnd}${xs[xs.length - 1]}`);
  /** The relations a group of passages supports, merged by verb: "adopts FIPS 203 and FIPS 204". */
  const relationLine = (es: CascadeEdgeView[]) => {
    const byVerb = new Map<string, { relation: string; pre: boolean; verified: boolean; stds: string[] }>();
    for (const e of es) {
      const key = `${e.relation}|${e.preStandardOnly}|${e.verified}`;
      const g = byVerb.get(key) ?? { relation: e.relation, pre: e.preStandardOnly, verified: e.verified, stds: [] };
      if (!g.stds.includes(e.to)) g.stds.push(e.to);
      byVerb.set(key, g);
    }
    return [...byVerb.entries()].map(([key, g]) => ({ key, text: fill(copy[REL_PHRASE[g.relation] ?? 'relPhraseReferences'], { standard: joinList(g.stds.map(stdNamed)) }), pre: g.pre, verified: g.verified }));
  };
  const relationSpans = (es: CascadeEdgeView[]) =>
    relationLine(es).map((r, i) => (
      <span key={r.key}>
        {i > 0 && '; '}
        {r.text}
        {r.pre && <span className="cc-flag">, {copy.preStandard}</span>}
        {!r.verified && <span className="cc-flag">, {copy.beingChecked}</span>}
      </span>
    ));
  const relLabel = (r: string) =>
    ({ adopts: copy.relAdopts, profiles: copy.relProfiles, references: copy.relReferences, fork: copy.relFork, 'parallel-interoperable': copy.relParallel, participates: copy.relParticipates })[r] ?? r;
  const selectedLinks = st.sel ? links.countries[st.sel] ?? null : null;

  // Page Up and Page Down move a year; the arrow keys, Home and End are the range's own
  const onSliderKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      setTime(allMonths[Math.min(allMonths.length - 1, Math.max(0, monthIndex + (e.key === 'PageUp' ? 12 : -12)))]);
    }
  };
  const spinePos = (d: string) => {
    const i = allMonths.indexOf(monthOf(d)); // a year-only event is marked at the month it counts from
    return i < 0 ? null : i / (allMonths.length - 1);
  };
  const fraction = monthIndex / (allMonths.length - 1);
  // the keyboard route into every view, the globe's above all: first the countries whose own
  // documents name a standard, then every other country on the orbit, each in alphabetical order
  const pick = useMemo(() => {
    const issuers = new Set(edges.map((e) => e.from));
    const all = orbit.nodes.map((n) => ({ iso3: n.iso3, name: info[n.iso3]?.name ?? n.iso3 })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    return { issuers: all.filter((j) => issuers.has(j.iso3)), others: all.filter((j) => !issuers.has(j.iso3)) };
  }, [orbit, info, edges]);
  const hint = st.view === 'globe' ? (isNist ? copy.hintGlobe : copy.hintGlobeBody) : st.view === 'map' ? (isNist ? copy.hintMap : copy.hintMapBody) : copy.hintOrbit;
  // another body's centre carries its name alone: its standards' names are too long to sit there
  const centreText = !isNist ? (body?.label ?? '') : st.std === 'all' ? copy.nistCentre : `${copy.nistCentre} · ${stdOf.get(st.std)?.short ?? st.std}`;
  // the note on how this body's citations were found, for the shared image too
  const bodyNote = isNist ? '' : fill(copy.bodyNote, { body: body?.label ?? '' });
  const foldedCount = (bodyOptions.length > 1 ? FOLDED : FOLDED - 1) - (isNist ? 0 : 1);
  const failed = <p className="lab-state cc-world-state">{copy.viewFailed}</p>;

  return (
    <div className={`cc${st.fork ? ' cc--fork' : ''}${selected ? ' cc--sel' : ''}`} data-live={ready ? '' : undefined}>
      <p className="fr-sr" role="status">
        {announce}
      </p>
      <div className="cc-controls">
        <Switch label={copy.viewLabel}>
          {VIEWS.map((v) => (
            <button key={v} type="button" aria-pressed={st.view === v} onClick={() => set({ view: v })}>
              {v === 'orbit' ? copy.viewOrbit : v === 'globe' ? copy.viewGlobe : copy.viewMap}
            </button>
          ))}
        </Switch>
        <div className={`cc-fold${folded ? '' : ' is-open'}`}>
          <button type="button" className="cc-fold-toggle" aria-expanded={!folded} aria-controls="cc-fold-body" onClick={() => setFolded((f) => !f)}>
            {fill(copy.foldLabel, { n: foldedCount })}
          </button>
          <div className="cc-fold-body" id="cc-fold-body">
            <Choices id="cc-group-l" label={copy.groupLabel} radio>
              {GROUPS.map((g) => (
                <label key={g}>
                  <input type="radio" name="cc-group" value={g} checked={st.group === g} onChange={() => set({ group: g })} />
                  <span>{g === 'all' ? copy.groupAll : g === 'eu' ? copy.groupEu : copy.groupNato}</span>
                </label>
              ))}
            </Choices>
            <Choices id="cc-show-l" label={copy.showLabel}>
              {/* a national process belongs to NIST's view: another body's has no Own process lines */}
              {SHOW_ORDER.filter((r) => isNist || r !== 'fork').map((r) => (
                <label key={r}>
                  <input
                    type="checkbox"
                    checked={st.rel.includes(r)}
                    onChange={() => set({ rel: st.rel.includes(r) ? st.rel.filter((x) => x !== r) : (RELATIONS.filter((x) => x === r || st.rel.includes(x)) as RelationFilter[]) })}
                  />
                  <span>{copy[`rel${r[0].toUpperCase()}${r.slice(1)}`]}</span>
                </label>
              ))}
            </Choices>
            <div className="cc-controls-row">
              {bodyOptions.length > 1 && (
                <label className="cc-field">
                  <span className="lbl">{copy.bodyLabel}</span>
                  <select className="lab-select" value={view.id} onChange={(e) => setBody(e.target.value)}>
                    {bodyOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="cc-field">
                <span className="lbl">{copy.standardLabel}</span>
                <select className="lab-select" value={st.std} onChange={(e) => set({ std: e.target.value })}>
                  <option value="all">{isNist ? copy.standardAll : fill(copy.standardAllBody, { body: body?.label ?? '' })}</option>
                  {centreStandards.map((s) => (
                    <option key={s.id} value={s.id}>
                      {stdNamed(s.id)}
                    </option>
                  ))}
                </select>
              </label>
              {isNist && (
                <button type="button" className="lab-btn" aria-pressed={st.fork} onClick={() => set({ fork: !st.fork })}>
                  {copy.forkToggle}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="cc-body">
        <div className="cc-stage">
          {st.fork && <p className="cc-fork-caption">{copy.forkCaption}</p>}
          {st.view === 'orbit' && (
            <CascadeOrbit
              orbit={orbit}
              frame={frame}
              info={info}
              copy={viewCopy}
              t={st.t}
              active={active}
              nodeFaded={nodeFaded}
              centreText={centreText}
              title={fill(copy.chartTitle, { month })}
              desc={isNist ? fill(copy.chartDescOrbit, descVars) : fill(copy.chartDescOrbitBody, { ...descVars, ...bodyVars })}
              ariaFor={ariaFor}
              tipFor={tipFor}
              onSelect={toggle}
            />
          )}
          {st.view === 'globe' && (
            <StageBoundary fallback={failed}>
              <CascadeGlobe geo={geo} info={info} atlas={atlas} frame={frame} copy={viewCopy} tipFor={tipFor} onSelect={select} />
            </StageBoundary>
          )}
          {st.view === 'map' && (
            <StageBoundary fallback={failed}>
              <CascadeMap
                geo={geo}
                info={info}
                atlas={atlas}
                frame={frame}
                copy={viewCopy}
                title={fill(copy.chartTitle, { month })}
                desc={isNist ? fill(copy.chartDescMap, descVars) : fill(copy.chartDescMapBody, { ...descVars, ...bodyVars })}
                tipFor={tipFor}
                onSelect={select}
              />
            </StageBoundary>
          )}
          <div className="cc-under">
            <p className="lab-hint">{hint}</p>
            <label className="cc-field">
              <span className="lbl">{copy.jurisdictionLabel}</span>
              <select ref={pickRef} className="lab-select" value={st.sel ?? ''} onChange={(e) => select(e.target.value || null)}>
                <option value="">{copy.jurisdictionNone}</option>
                <optgroup label={copy.pickIssuers}>
                  {pick.issuers.map((j) => (
                    <option key={j.iso3} value={j.iso3}>
                      {j.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={copy.pickOthers}>
                  {pick.others.map((j) => (
                    <option key={j.iso3} value={j.iso3}>
                      {j.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
        </div>

        <div className="cc-when">
          <div className="cc-time">
            <div className="cc-track" style={{ '--cc-f': fraction } as React.CSSProperties}>
              <span className="cc-spine-label" aria-hidden="true">
                {copy.spineTitle}
              </span>
              <div className="cc-spine" aria-hidden="true">
                {spine.map((s) => {
                  const f = spinePos(s.date);
                  return f === null ? null : (
                    <span key={s.id} className={`cc-spine-mark${onOrBefore(s.date, st.t) ? ' is-past' : ''}`} style={{ '--cc-at': f } as React.CSSProperties} title={`${formatDate(s.date)}: ${s.label}`} />
                  );
                })}
              </div>
              <div className="cc-rail" aria-hidden="true">
                <span />
              </div>
              <input
                className="cc-range"
                type="range"
                min={0}
                max={allMonths.length - 1}
                value={monthIndex}
                aria-label={copy.timeLabel}
                aria-valuetext={month}
                onChange={(e) => setTime(allMonths[Number(e.target.value)])}
                onKeyDown={onSliderKey}
              />
              <div className="cc-track-ends mono" aria-hidden="true">
                <span>{allMonths[0].slice(0, 4)}</span>
                <span>{endMonth.slice(0, 4)}</span>
              </div>
            </div>
            <output className="cc-month mono">{month}</output>
          </div>
          <p className="cc-counter" aria-live="polite">
            {statement}
          </p>
          {noLines && <p className="cc-empty-line">{copy.empty}</p>}
        </div>

        <aside className="cc-side lab-group">
          {selected ? (
            <div className="cc-detail">
              <div className="cc-detail-head">
                <h2 ref={panelRef}>{selected.name}</h2>
                <button
                  type="button"
                  className="lab-btn cc-close"
                  onClick={() => {
                    // the button goes with the panel: keep the keyboard where the choice was made
                    select(null);
                    pickRef.current?.focus();
                  }}
                  aria-label={copy.detailClose}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2 2 L10 10 M10 2 L2 10" />
                  </svg>
                </button>
              </div>
              <p className="cc-detail-meta">
                <span className="lab-chip">
                  <span className="d" style={{ background: selected.postureColor ?? 'var(--ink-faint)' }} />
                  {selected.postureShort ?? copy.noPostureShort}
                </span>
                <RoleBadge role={selected.role} />
                {selected.confidence && <span className="cc-meta-item">{fill(copy.detailConfidence, { confidence: selected.confidence.toLowerCase() })}</span>}
                {selected.verificationStatus === 'Unverified' && <span className="cc-meta-item">{copy.detailUnverified}</span>}
              </p>
              {selectedDocs.length === 0 && <p className="cc-empty">{fill(copy.detailNone, { name: selected.name })}</p>}
              <ol className="cc-evidence">
                {selectedDocs.map((d) => (
                  <li key={d.url} className={onOrBefore(d.date, st.t) ? undefined : 'is-later'}>
                    <p className="cc-ev-head">
                      <span className="mono">{formatDate(d.date)}</span> {d.org}, <cite>{d.title}</cite>
                    </p>
                    {/* without the source's words, one line says what the document does; in review, each
                        run of quotes follows the relations it supports */}
                    {!showWords && <p className="cc-ev-rel">{relationSpans(selectedEdges.filter((e) => e.documentUrl === d.url))}</p>}
                    {showWords &&
                      d.groups.map((g) => (
                        <div key={g.edges.map((e) => e.id).join(' ')} className="cc-ev-group">
                          <p className="cc-ev-rel">{relationSpans(g.edges)}</p>
                          {/* a source's own words as the kit sets a quotation (global.css .quote): indented,
                              in Newsreader, inside curly quotation marks, never a left rule */}
                          {g.passages.map((p, i) => (
                            <figure key={`${p.locator}|${p.excerpt}`} className="cc-ev-quote">
                              <blockquote className="quote" cite={d.url}>
                                <p>{p.excerpt}</p>
                              </blockquote>
                              {/* each quote's own place in the document; said once under a run of quotes from the same place */}
                              {p.locator && g.passages[i + 1]?.locator !== p.locator && <figcaption className="quote-source cc-ev-loc">{p.locator}</figcaption>}
                            </figure>
                          ))}
                        </div>
                      ))}
                    {/* every document carries these two, so they are index links (global.css .row-link) */}
                    <p className="cc-ev-source">
                      <a className="row-link" href={d.url} rel="noopener">
                        {copy.detailRead}
                      </a>
                      {links.records[d.url] && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <a className="row-link" href={links.records[d.url]}>
                            {copy.detailRecord}
                          </a>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
              {(selectedLinks?.profile || selectedLinks?.documents) && (
                <p className="cc-links">
                  {selectedLinks.profile && <a href={selectedLinks.profile}>{selectedLinks.profileLabel}</a>}
                  {selectedLinks.documents && <a href={selectedLinks.documents}>{selectedLinks.documentsLabel}</a>}
                </p>
              )}
            </div>
          ) : (
            <div className="cc-legend">
              <h2 className="fr-sr">{copy.legendTitle}</h2>
              <p className="cc-key-head">{copy.legendColour}</p>
              <ul className="cc-key-list">
                {POSTURE_ORDER.map((k) => (
                  <li key={k}>
                    <span className="cc-swatch" style={{ background: POSTURE_META[k].color }} aria-hidden="true" />
                    {POSTURE_META[k].label}
                  </li>
                ))}
                {/* a country with no posture recorded (another body's view only, today): marked open, by a dashed edge */}
                {st.view !== 'orbit' && orbit.sectors.some((s) => s.key === 'none') && (
                  <li>
                    <span className="cc-swatch cc-swatch--open" aria-hidden="true" />
                    {copy.noPosture}
                  </li>
                )}
                {st.view !== 'orbit' && (
                  <li>
                    <span className="cc-swatch cc-swatch--grey" aria-hidden="true" />
                    {!isNist && st.std === 'all' ? fill(copy.legendGreyBody, bodyVars) : fill(copy.legendGrey, { standard: standardPhrase })}
                  </li>
                )}
              </ul>
              {st.view === 'orbit' && (
                <>
                  <p className="cc-key-head">{copy.legendShape}</p>
                  <ul className="cc-key-list">
                    {ROLE_ORDER.map((k) => (
                      <li key={k}>
                        <svg viewBox="-16 -16 32 32" aria-hidden="true" className="cc-key-shape">
                          <Marker role={k} size={5} color="var(--ink)" faint={false} />
                        </svg>
                        <RoleBadge role={k} short />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {/* another body has no seat on the globe or the map, so those views draw no line to read */}
              {!isNist && st.view !== 'orbit' ? (
                <p className="cc-key-note">{copy.legendNoLinesBody}</p>
              ) : (
                <>
                  <p className="cc-key-head">{isNist ? copy.legendLines : copy.legendLinesBody}</p>
                  <ul className="cc-key-list">
                    <li>
                      <LineSample kind="references" />
                      {copy.linkNames}
                    </li>
                    <li>
                      <LineSample kind="adopts" />
                      {copy.linkAdopts}
                    </li>
                    <li>
                      <LineSample kind="profiles" />
                      {copy.linkProfiles}
                    </li>
                    <li>
                      <LineSample kind="adopts" pre />
                      {copy.linkPreStandard}
                    </li>
                    {st.view === 'orbit' && isNist && (
                      <li>
                        <LineSample kind="own" />
                        {copy.linkOwn}
                      </li>
                    )}
                    {hasLeads && (
                      <li>
                        <LineSample kind="lead" />
                        {copy.linkLead}
                      </li>
                    )}
                  </ul>
                  <p className="cc-key-head">{copy.legendWeight}</p>
                  <ul className="cc-key-list">
                    <li>
                      <LineSample kind="profiles" docs={1} />
                      {copy.weightOne}
                    </li>
                    <li>
                      <LineSample kind="profiles" docs={maxDocs} />
                      {fill(copy.weightMany, { n: maxDocs })}
                    </li>
                  </ul>
                </>
              )}
              {st.view === 'orbit' && <p className="cc-key-note">{isNist ? copy.legendRings : fill(copy.legendRingsBody, bodyVars)}</p>}
              <p className="cc-key-note">{copy.legendTicks}</p>
            </div>
          )}
        </aside>
      </div>

      <ShareBar
        svgSelector=".cc-svg, .cc-globe-canvas"
        title={copy.title}
        lines={[line1, line2, noLines ? copy.empty : '', bodyNote].filter(Boolean)}
        sourceLine={isNist ? copy.shareSource : fill(copy.shareSourceBody, { body: body?.label ?? '' })}
        asOf={view.asOfLabel}
        filename={isNist ? 'standards-cascade.png' : `standards-cascade-${view.id}.png`}
      />

      <details className="lab-table">
        <summary>{copy.tableSummary}</summary>
        {/* under 640px each table becomes hairline-ruled rows (lab.css .is-stack); wider, a table
            that outgrows its column scrolls inside its own named region, never the page */}
        <div className="cc-table-scroll" role="region" aria-label={copy.tableCaption} tabIndex={0}>
          <table className="is-stack">
            <caption>{copy.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.colDate}</th>
                <th scope="col">{copy.colJurisdiction}</th>
                <th scope="col">{copy.colRelation}</th>
                <th scope="col">{copy.colStandard}</th>
                <th scope="col">{copy.colIssuer}</th>
                <th scope="col">{copy.colSource}</th>
              </tr>
            </thead>
            <tbody>
              {[...edges].sort(byDate).map((e) => (
                <tr key={e.id}>
                  <th scope="row" className="mono">
                    {formatDate(e.date)}
                  </th>
                  <td data-label={copy.colJurisdiction}>{info[e.from]?.name ?? e.from}</td>
                  <td data-label={copy.colRelation}>
                    {relLabel(e.relation)}
                    {e.preStandardOnly ? ` (${copy.preStandard})` : ''}
                  </td>
                  <td data-label={copy.colStandard}>{stdNamed(e.to)}</td>
                  <td data-label={copy.colIssuer}>{e.issuingOrg}</td>
                  <td data-label={copy.colSource}>
                    <a className="row-link" href={e.documentUrl} rel="noopener">
                      {copy.source}
                    </a>
                    {e.verified ? '' : ` (${copy.beingChecked})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cc-table-scroll" role="region" aria-label={copy.spineCaption} tabIndex={0}>
          <table className="is-stack">
            <caption>{copy.spineCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.colDate}</th>
                <th scope="col">{copy.colEvent}</th>
                <th scope="col">{copy.colBody}</th>
                <th scope="col">{copy.colSource}</th>
              </tr>
            </thead>
            <tbody>
              {spine.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="mono">
                    {formatDate(s.date)}
                  </th>
                  <td data-label={copy.colEvent}>{s.label}</td>
                  <td data-label={copy.colBody}>{s.body}</td>
                  <td data-label={copy.colSource}>
                    {s.url && (
                      <a className="row-link" href={s.url} rel="noopener">
                        {copy.source}
                      </a>
                    )}
                    {s.verified ? '' : ` (${copy.beingChecked})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
