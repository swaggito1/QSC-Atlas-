// The EU rules tool (Rulebook in Motion). It stands on its own, so it can live on a site of its
// own: it links to no Atlas page, only to EUR-Lex and, when the page passes them, to absolute
// Atlas country profiles. A visitor sees the worked examples (one at a time), the questions and
// the outcome: which acts plausibly apply, and how many reports one incident can start. The
// reasons, the assumptions, the article map, the Commission proposals and the tables wait
// behind disclosures. When answers change, the outcome rows and the deadline rows ease into
// place, by transform alone; under reduced motion everything is instant.
//
// The scope engine is src/lib/lab/scope.ts; every rule is in data/lab/rulebook/scope-rules.json.
// Orientation, never advice: the frame writes the note on compliance once, and this island never
// carries it. The law's own words (article text, verbatim sentences) reach the island only in a
// build that may carry them (sourceWordsAvailable) and show only when the page is opened for
// review (reviewRequested, after mount, so the server render and the first client render agree).

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent as ReactFocusEvent, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';
import { scaleLog } from 'd3-scale';
import {
  BLANK_ANSWERS,
  LAW_STATUSES,
  QUESTION_KEYS,
  WORKED_EXAMPLES,
  answersToSearch,
  articleFromParam,
  evaluateScope,
  hasStarted,
  nextExample,
  regimeArticleKey,
  reportsInFirstMonth,
  searchToAnswers,
  statusLineKey,
  stepTimes,
  touchingProposals,
} from '../../../../lib/lab/scope';
import type { Answers, Outcome, QuestionKey, Sector, Tri } from '../../../../lib/lab/scope';
import type { RbArticle, RbObligation, RbProposal, RbRegime, RulebookData } from '../../../../lib/lab/rulebook-data';
import { fill } from '../../../../lib/lab/exposure';
import { formatDate } from '../../../../lib/lab/format';
import { REVIEW_PARAM, reviewRequested } from '../../../../lib/site/review';

export type RulebookProps = Pick<
  RulebookData,
  'articles' | 'regimes' | 'obligations' | 'proposals' | 'sectors' | 'sizeClasses' | 'rules' | 'memberStates' | 'lawAsOf'
> & {
  copy: Record<string, string>; // the island's copy (islandCopy): no server-only strings
  instruments: { celex: string; short: string }[];
  themes: string[];
  /** ISO3 of a Member State to its Atlas profile, absolute. Optional: with none, no profile link. */
  profiles?: Record<string, string>;
  /** sourceWordsInBuild(), from the server: whether this build may carry the law's own words. */
  sourceWordsAvailable?: boolean;
  /** The answers of the first render, for a page or a test that presets them; a link's answers win. */
  initialAnswers?: Answers;
};

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function download(name: string, rows: (string | number | null)[][]) {
  // a byte order mark, so a spreadsheet reads accented names correctly
  const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** The width of an element, followed as it changes, and whether it has been measured yet. The
    first render uses the fallback on the server and in the browser alike, so hydration sees the
    same markup. A width of 0 (inside a closed disclosure) is not a measurement: the drawing waits
    until the element is shown. */
function useWidth(ref: RefObject<HTMLElement | null>, fallback: number): [number, boolean] {
  const [w, setW] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const take = (v: number) => {
      if (v > 0) setW(Math.round(v));
    };
    take(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => take(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return [w ?? fallback, w !== null];
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EASE_MS = 240; // rows and boxes ease into place in this time (the --dur-mid token)
const EX_MS = 2000; // one example's turn: it fades in over 240ms, stays about 1.5s, then gives way

interface Snapshot {
  w: number;
  tops: Map<string, number>;
}

/**
 * Rows that ease into place. When `signature` changes, every child marked data-flip slides from
 * where it was to where it is now, by transform alone; the box takes its new height at once
 * (height is never animated). The last layout is recorded after each change and whenever the box
 * resizes (a disclosure opened inside it, a narrower window), so a change always starts from what
 * is on screen. A change of width is never animated, and nothing moves under reduced motion.
 */
function useSmooth(ref: RefObject<HTMLElement | null>, signature: string) {
  const last = useRef<Snapshot | null>(null);
  const timer = useRef<number | null>(null);
  const snap = (box: HTMLElement): Snapshot => {
    const r = box.getBoundingClientRect();
    const tops = new Map<string, number>();
    box.querySelectorAll<HTMLElement>('[data-flip]').forEach((k) => tops.set(k.dataset.flip ?? '', k.getBoundingClientRect().top - r.top));
    return { w: r.width, tops };
  };
  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      last.current = snap(box);
    });
    ro.observe(box);
    return () => {
      ro.disconnect();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [ref]);
  useIsoLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    if (timer.current) window.clearTimeout(timer.current);
    const kids = [...box.querySelectorAll<HTMLElement>('[data-flip]')];
    // the true new layout, with any movement still in flight removed
    for (const k of kids) {
      k.style.transform = '';
      k.style.transition = '';
    }
    const prev = last.current;
    const now = snap(box);
    last.current = now;
    if (!prev || Math.abs(prev.w - now.w) > 1 || reducedMotion()) return;
    let moving = false;
    for (const k of kids) {
      const was = prev.tops.get(k.dataset.flip ?? '');
      const dy = was === undefined ? 0 : was - (now.tops.get(k.dataset.flip ?? '') ?? was);
      if (Math.abs(dy) >= 1) {
        k.style.transform = `translateY(${dy}px)`;
        moving = true;
      }
    }
    if (!moving) return;
    void box.offsetHeight; // the starting positions take effect before the movement is set
    const ease = `${EASE_MS}ms var(--ease-out)`;
    for (const k of kids) {
      if (!k.style.transform) continue;
      k.style.transition = `transform ${ease}`;
      k.style.transform = '';
    }
    timer.current = window.setTimeout(() => {
      for (const k of kids) k.style.transition = '';
      timer.current = null;
    }, EASE_MS + 40);
  }, [signature]);
}

/** A sentence with each {placeholder} filled and set in the mono face: the counts in a readout. */
function monoFill(template: string, vars: Record<string, string | number>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const m = part.match(/^\{(\w+)\}$/);
    return m && m[1] in vars ? (
      <span key={i} className="mono">
        {vars[m[1]]}
      </span>
    ) : (
      part
    );
  });
}

// SVG coordinates are rounded to hundredths, so the server render and the browser agree
const r2 = (v: number) => Math.round(v * 100) / 100;
// a label that would run past either edge is anchored to that edge instead of centred
const anchorAt = (px: number, width: number, max: number) => (px - width / 2 < 0 ? 'start' : px + width / 2 > max ? 'end' : 'middle');
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
// "The competent authority" reads as "to the competent authority"; a proper name keeps its capital
const lowerThe = (s: string) => (/^The /.test(s) ? `t${s.slice(1)}` : s);
const eurlexOf = (celex: string) => `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`;

const MAX_H = 24 * 45; // the axis runs from 1 hour to 45 days
// axis ticks; when labels would touch, the higher rank keeps its place and a lower one shortens or goes
const TICKS: { h: number; key: string; short?: string; rank: number }[] = [
  { h: 1, key: 'tick1h', rank: 0 },
  { h: 4, key: 'tick4h', rank: 5 },
  { h: 24, key: 'tick24h', rank: 1 },
  { h: 72, key: 'tick72h', rank: 2 },
  { h: 168, key: 'tick7d', short: 'tick7dShort', rank: 4 },
  { h: 336, key: 'tick14d', short: 'tick14dShort', rank: 6 },
  { h: 720, key: 'tick1m', rank: 3 },
];
const TICK_CHAR = 7.7; // the advance of Spline Sans Mono at 0.8rem (12.8px), the floor for any label
const TICK_GAP = 8; // the least space between two axis labels
const TRACK_H = 64; // one regime row's track
const TRACK_Y = 20; // its baseline
const LABEL_W = 280; // the label column beside the tracks on wider screens (lab-rulebook.css)
const MAP_MAX = 1000; // the article map is drawn at its true size up to this width
const DOT_CHAR = 7.7; // the advance of the article numbers under the dots, 0.8rem mono
const PLAY_MS = 12000; // the cursor's run across the axis, started by the visitor

const PauseIcon = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true">
    <rect x="1.5" y="1" width="2.5" height="8" />
    <rect x="6" y="1" width="2.5" height="8" />
  </svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 1 L9 5 L2 9 Z" />
  </svg>
);

export default function RulebookTool(props: RulebookProps) {
  const { copy, articles, regimes, obligations, proposals, sectors, sizeClasses, rules, memberStates, lawAsOf, instruments, themes } = props;
  const profiles = props.profiles ?? {};
  const [a, setA] = useState<Answers>(props.initialAnswers ?? BLANK_ANSWERS);
  const [overlay, setOverlay] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [focusDot, setFocusDot] = useState<string | null>(null);
  const [inputs, setInputs] = useState({ classifiedAfterHours: 2, fixAfterDays: 10 });
  const [cursor, setCursor] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [showSource, setShowSource] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  // the worked examples: which one is in view, and whether the turn has stopped
  const [exIndex, setExIndex] = useState(0);
  const [exPlaying, setExPlaying] = useState(true);
  const [exHover, setExHover] = useState(false);
  const [exFocus, setExFocus] = useState(false);
  const [reduced, setReduced] = useState(false);
  const review = useRef(false);
  const raf = useRef<number | null>(null);
  const dlRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const outBox = useRef<HTMLDivElement>(null);
  const dlBox = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelHeadRef = useRef<HTMLHeadingElement>(null);
  const sectorRef = useRef<HTMLSelectElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const revealPanel = useRef<false | 'scroll' | 'jump'>(false);
  const focusPanelHead = useRef(false);
  const [dlW, dlMeasured] = useWidth(dlRef, 820);
  const [mapW, mapMeasured] = useWidth(mapRef, MAP_MAX);

  const flatSectors: Sector[] = useMemo(
    () => sectors.flatMap((s) => [{ id: s.id, label: s.label, annex: s.annex, cer: s.cer }, ...s.subsectors.map((x) => ({ id: x.id, label: `${s.label}: ${x.label}`, annex: s.annex, cer: s.cer }))]),
    [sectors],
  );
  const articleByKey = useMemo(() => new Map(articles.map((x) => [x.key, x])), [articles]);

  useEffect(() => {
    const s = searchToAnswers(window.location.search);
    // a link names only sectors and countries the page knows
    if (s.a.sector && s.a.sector !== 'none' && !flatSectors.some((x) => x.id === s.a.sector)) s.a.sector = null;
    if (s.a.established && s.a.established !== 'outside' && !memberStates.some((m) => m.iso3 === s.a.established)) s.a.established = null;
    if (answersToSearch(s.a) !== '') setA(s.a);
    setOverlay(s.overlay);
    // ?article= names an article, or an act by its CELEX number (its first article opens). A link
    // that names one opens the articles: the page jumps to the panel and the keyboard starts on
    // its heading. A link with the proposals shown opens them too, so the switch is in view.
    const key = articleFromParam(s.sel, articles);
    if (key) {
      revealPanel.current = 'jump';
      focusPanelHead.current = true;
    }
    if (key || s.overlay) setDetailOpen(true);
    setSel(key);
    // the law's own words: only in a build that carries them, and only on a page opened for review
    review.current = reviewRequested();
    setShowSource(Boolean(props.sourceWordsAvailable) && review.current);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(mq.matches);
    onMotion();
    mq.addEventListener('change', onMotion);
    setReady(true);
    return () => mq.removeEventListener('change', onMotion);
  }, []);
  useEffect(() => {
    if (!ready) return;
    // the answers travel in the address; a review page stays a review page
    const q = answersToSearch(a, overlay, sel);
    const keep = review.current ? `${q ? '&' : '?'}${REVIEW_PARAM}=1` : '';
    window.history.replaceState(null, '', window.location.pathname + q + keep + window.location.hash);
  }, [a, overlay, sel, ready]);

  // ---- the worked examples take turns, one at a time, until the visitor holds them ----
  // the pointer over them or the keyboard inside them holds the turn; Pause stops it; under
  // reduced motion they are a still list (lab-rulebook.css) and never turn
  const exRunning = ready && exPlaying && !exHover && !exFocus && !reduced;
  useEffect(() => {
    if (!exRunning) return;
    const t = window.setInterval(() => setExIndex((i) => nextExample(i, WORKED_EXAMPLES.length)), EX_MS);
    return () => window.clearInterval(t);
  }, [exRunning]);
  const leaveExamples = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setExFocus(false);
  };

  const results = evaluateScope(rules, a, flatSectors, instruments.map((i) => i.celex));
  const started = hasStarted(a);
  const outcomeOf = (celex: string): Outcome | null => results.find((r) => r.instrument === celex)?.outcome ?? null;
  const shortOf = (celex: string) => instruments.find((i) => i.celex === celex)?.short ?? celex;
  const nameOf = (key: string) => {
    const art = articleByKey.get(key);
    return art ? `${shortOf(art.celex)} ${art.ref}` : key;
  };
  const currentExample = answersToSearch(a);
  const unit = (n: number, u: 'hours' | 'days' | 'months') => copy[`${u.slice(0, -1)}${n === 1 ? '' : 's'}Unit`];
  const answered = QUESTION_KEYS.filter((k) => a.q[k]).length;

  // the country in ?in=, and its Atlas profile when the page passed one
  const country = a.established && a.established !== 'outside' ? memberStates.find((m) => m.iso3 === a.established) ?? null : null;
  const profileHref = country ? profiles[country.iso3] ?? null : null;
  const hasProfiles = Object.keys(profiles).length > 0;

  // reporting deadlines: only the rules that appear to apply, once there is an answer
  const visibleRegimes = regimes.filter((r) => !r.hiddenReason);
  const hiddenRegimes = started ? regimes.filter((r) => r.hiddenReason && outcomeOf(r.celex) !== 'does-not-appear-to-apply') : [];
  const shownRegimes = started ? visibleRegimes.filter((r) => outcomeOf(r.celex) === 'appears-to-apply') : [];
  // the steps counted from a moment the visitor supplies: DORA's classification, the CRA's fix
  const countedFrom = (kind: 'classified' | 'fix') => [...new Set(shownRegimes.filter((r) => r.steps.some((s) => s.fromKind === kind)).map((r) => r.shortLabel))].join(', ');
  const classifiedBy = countedFrom('classified');
  const fixBy = countedFrom('fix');
  const { n, m } = reportsInFirstMonth(shownRegimes.map((r) => ({ id: r.id, shortLabel: r.shortLabel, celex: r.celex, recipient: r.recipient, steps: r.steps })), inputs);

  useSmooth(outBox, started ? results.map((r) => r.outcome).join('|') : '');
  useSmooth(dlBox, started ? `${shownRegimes.map((r) => r.id).join(',')}|${overlay}` : '');

  // the cursor runs across the log axis only when the visitor asks; reduced motion jumps to the end
  const stopPlay = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setRunning(false);
  };
  const resetPlay = () => {
    stopPlay();
    setCursor(null);
  };
  const play = () => {
    if (reducedMotion()) {
      setCursor(MAX_H);
      return;
    }
    setRunning(true);
    const from = cursor && cursor < MAX_H ? cursor : 1;
    const t0 = performance.now() - (Math.log(from) / Math.log(MAX_H)) * PLAY_MS;
    const tick = (now: number) => {
      const f = Math.min(1, (now - t0) / PLAY_MS);
      setCursor(Math.exp(f * Math.log(MAX_H)));
      if (f < 1) raf.current = requestAnimationFrame(tick);
      else {
        raf.current = null;
        setRunning(false);
      }
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);
  const dueSoFar = cursor === null ? 0 : shownRegimes.reduce((acc, r) => acc + stepTimes(r, inputs).filter((s) => s.dueHours <= cursor).length, 0);
  const dueLine = `${dueSoFar} ${dueSoFar === 1 ? copy.deadlinesDueOne : copy.deadlinesDue}`;
  const when = (h: number) => {
    if (h < 48) {
      const v = Math.round(h);
      return `${v} ${unit(v, 'hours')}`;
    }
    const v = Math.round(h / 24);
    return `${v} ${unit(v, 'days')}`;
  };
  // a screen reader hears the count only when it changes, and the time once the cursor stops
  const announce = cursor === null ? '' : running ? dueLine : `${dueLine}, ${when(cursor)}`;
  // and the outcome, in one line, whenever the answers change it
  const sentence = fill(copy.deadlinesSentence, { n, m });
  const outcomeLine = started
    ? `${results.map((r) => `${shortOf(r.instrument)}: ${r.outcome ? copy[r.outcome] : ''}`).join('. ')}. ${shownRegimes.length ? sentence : copy.deadlinesNone}`
    : '';

  // ---- deadline geometry: labels are HTML, so they wrap; each row's track is its own SVG ----
  const compact = dlW < 640;
  const TW = Math.max(240, compact ? dlW : dlW - LABEL_W - 24);
  const xScale = scaleLog().domain([1, MAX_H]).range([8, TW - 8]).clamp(true);
  const x = (v: number) => r2(xScale(v));
  const tickLabels = useMemo(() => {
    const placed: { h: number; label: string; anchor: ReturnType<typeof anchorAt>; from: number; to: number }[] = [];
    for (const t of [...TICKS].sort((p, q) => p.rank - q.rank)) {
      const px = r2(xScale(t.h));
      for (const key of [t.key, t.short].filter(Boolean) as string[]) {
        const label = copy[key];
        const w = label.length * TICK_CHAR;
        const anchor = anchorAt(px, w, TW);
        const from = anchor === 'start' ? px : anchor === 'end' ? px - w : px - w / 2;
        if (placed.every((p) => from + w + TICK_GAP <= p.from || from >= p.to + TICK_GAP)) {
          placed.push({ h: t.h, label, anchor, from, to: from + w });
          break;
        }
      }
    }
    return placed.sort((p, q) => p.h - q.h);
  }, [TW, copy]);
  const proposalLabel = (p: RbProposal) => fill(copy.overlayLabel, { com: p.com, stage: lowerFirst(p.stage), date: formatDate(p.stageDate) });

  // ---- map geometry, drawn at its true size: columns are instruments, bands are themes ----
  const MW = Math.min(MAP_MAX, Math.max(280, mapW));
  const mapCompact = MW < 640;
  const LBL = mapCompact ? 0 : 190;
  const cols = Math.max(1, instruments.length);
  // on a phone each number is drawn to the right of its dot, so the last column keeps room for the
  // widest one inside the map's right edge
  const numW = 14 + Math.max(1, ...articles.map((x) => x.ref.replace('Article ', '').length)) * DOT_CHAR;
  const colW = mapCompact ? (MW - numW) / Math.max(0.5, cols - 0.5) : (MW - LBL) / cols;
  const colX = (i: number) => r2(LBL + (i + 0.5) * colW);
  const cellArticles = (celex: string, theme: string) => articles.filter((x) => x.celex === celex && x.theme === theme);
  const map = useMemo(() => {
    const pos = new Map<string, [number, number]>();
    const bands: { theme: string; ruleY: number; labelY: number }[] = [];
    let y = mapCompact ? 28 : 34;
    for (const th of themes) {
      const cells = instruments.map((ins) => cellArticles(ins.celex, th));
      const most = Math.max(1, ...cells.map((c) => c.length));
      if (mapCompact) {
        // a phone: the theme heads its band, and a cell's dots stack one under another
        bands.push({ theme: th, ruleY: y, labelY: y + 17 });
        cells.forEach((arts, i) => arts.forEach((art, k) => pos.set(art.key, [colX(i), r2(y + 48 + k * 44)])));
        y += 30 + most * 44;
      } else {
        const perLine = 3;
        const lines = Math.ceil(most / perLine);
        const spacing = Math.min(44, colW / 2 - 2);
        bands.push({ theme: th, ruleY: y, labelY: y + 34 });
        cells.forEach((arts, i) =>
          arts.forEach((art, k) => {
            const line = Math.floor(k / perLine);
            const inLine = Math.min(perLine, arts.length - line * perLine);
            pos.set(art.key, [r2(colX(i) + ((k % perLine) - (inLine - 1) / 2) * spacing), r2(y + 30 + line * 30)]);
          }),
        );
        y += 54 + lines * 30;
      }
    }
    return { pos, bands, height: r2(y + 4) };
  }, [articles, instruments, themes, MW, mapCompact]);
  const selected = sel ? articleByKey.get(sel) ?? null : null;
  const selObligations = selected ? obligations.filter((o) => o.articleKey === selected.key && LAW_STATUSES.has(o.status)) : [];
  const allDraft = selObligations.length > 1 && selObligations.every((o) => !o.verified);
  const selRefs = selected ? selected.crossRefs.filter((k) => articleByKey.has(k)) : [];
  const selProposals = selected && overlay ? touchingProposals(proposals, selected.key) : [];
  const selText = showSource && selected ? selected.paragraphs.filter((p) => p.quote) : [];

  // selecting a dot where the panel opens below the map brings the panel into view
  const choose = (key: string) => {
    const next = sel === key ? null : key;
    revealPanel.current = next !== null ? 'scroll' : false;
    setSel(next);
  };
  // following a reference keeps the keyboard in the panel, on the new article's heading
  const goTo = (key: string) => {
    revealPanel.current = 'scroll';
    focusPanelHead.current = true;
    setSel(key);
  };
  useEffect(() => {
    if (focusPanelHead.current && panelHeadRef.current) {
      focusPanelHead.current = false;
      panelHeadRef.current.focus({ preventScroll: true });
    }
    if (!revealPanel.current || !panelRef.current) return;
    // a visitor's own choice follows the page's scrolling (none under reduced motion); arriving
    // from a link jumps there at once, since nothing the visitor did started a movement
    const behavior = (revealPanel.current === 'jump' ? 'instant' : 'auto') as ScrollBehavior;
    revealPanel.current = false;
    const top = panelRef.current.getBoundingClientRect().top;
    if (top > window.innerHeight - 96 || top < 0) panelRef.current.scrollIntoView({ block: 'start', behavior });
  }, [sel, detailOpen]);
  const closePanel = () => {
    const key = sel;
    setSel(null);
    if (key) (mapRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`) as SVGGElement | null)?.focus();
  };

  const setQ = (k: QuestionKey, v: Tri) => setA((s) => ({ ...s, q: { ...s.q, [k]: v } }));
  const outcomeClass = (o: Outcome | null) => (o ? `rb-outcome is-${o}` : 'rb-outcome');
  const themeLabel = (th: string) => copy[`theme${th[0].toUpperCase()}${th.slice(1)}`] ?? th;
  const pickExample = (e: ReactMouseEvent<HTMLAnchorElement>, ex: Answers) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab keeps the link
    e.preventDefault();
    setA(ex);
    resetPlay();
  };
  const startAgain = () => {
    setA(BLANK_ANSWERS);
    resetPlay();
    sectorRef.current?.focus(); // the button hides with the answers, so focus moves to the first question
  };

  // the words under an obligation: when it applies, never mixing a proposal into the law. An
  // article with no single date (CER Chapter III runs from each entity's notification) takes the
  // condition the reporting regime for that article records.
  const statusLine = (o: RbObligation) => {
    const r = regimes.find((x) => regimeArticleKey(x) === o.articleKey);
    const key = statusLineKey(o, lawAsOf, Boolean(r));
    return key ? fill(copy[key], { date: formatDate(o.appliesFrom), who: r ? lowerFirst(r.who) : '' }) : '';
  };
  // when a regime applies, for its rows in the table: the words the article panel uses, from the
  // regime's own record, so a regime with no single date (CER) gives its condition. When another
  // act sets the time limits (DORA's, set by a delegated regulation), the base act's date is said
  // of the base act alone and never given to a time limit it does not set
  const regimeApplies = (r: RbRegime) => {
    const key = statusLineKey(r, lawAsOf, Boolean(r.who));
    if (!key) return '';
    const line = fill(copy[key], { date: formatDate(r.appliesFrom), who: lowerFirst(r.who) });
    return r.timeLimitCelex ? fill(copy.statusTimeLimitElsewhere, { act: r.shortLabel, status: line }) : line;
  };
  // a regime's name in the table: the act and the article that sets it, so two regimes of one act
  // ("CRA Article 14(2)", "CRA Article 14(4)") are told apart
  const regimeHead = (r: RbRegime) => `${r.shortLabel} ${r.articleRef.split(';')[0].trim()}`;
  // when every obligation in the panel has the same line, it is said once under the heading
  const selStatuses = selObligations.map(statusLine);
  const sharedStatus = selStatuses.length > 1 && selStatuses.every((s) => s === selStatuses[0]) && selStatuses[0] ? selStatuses[0] : null;

  // ---- quiet actions; the law's own words go into a download only where the page shows them ----
  const exportRows = started ? obligations.filter((o) => LAW_STATUSES.has(o.status) && outcomeOf(o.celex) === 'appears-to-apply') : [];
  const regimeName = (id: string | null) => {
    const r = id ? regimes.find((x) => x.id === id) : null;
    return r ? `${r.shortLabel} ${r.articleRef}` : '';
  };
  const exportObligations = () => {
    const head = ['Instrument', 'Article', 'Addressee', 'Action', 'Plain-language action reviewed', 'Reporting deadlines set by', ...(showSource ? ['Verbatim sentence'] : []), 'Status', 'Applies from', 'When it applies', 'EUR-Lex'];
    const rows: (string | number | null)[][] = [head];
    for (const o of exportRows) {
      rows.push([shortOf(o.celex), o.articleRef, o.addressee, o.action, o.verified ? 'yes' : `no, ${copy.obligationDraft}`, regimeName(o.deadlineId), ...(showSource ? [o.sentence] : []), o.status, o.appliesFrom, statusLine(o), o.url]);
    }
    download('eu-rules-obligations.csv', rows);
    setStatus(fill(copy.exportDone, { n: exportRows.length }));
  };
  const exportMap = () => {
    const rows: (string | number | null)[][] = [['Paragraph id', 'Instrument', 'Reference', 'Theme', 'Cross-references', ...(showSource ? ['Text'] : []), 'EUR-Lex']];
    for (const art of articles) for (const p of art.paragraphs) rows.push([p.id, shortOf(art.celex), p.ref, art.theme, art.crossRefs.join('; '), ...(showSource ? [p.quote] : []), art.eurlex]);
    download('eu-rules-article-map.csv', rows);
    setStatus(fill(copy.exportDone, { n: rows.length - 1 }));
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus(copy.actionCopied);
    } catch {
      setStatus(copy.actionCopyFailed);
    }
  };
  const actions: { key: string; label: string; run: () => void }[] = [{ key: 'copy', label: copy.actionCopy, run: copyLink }];
  if (exportRows.length > 0) actions.push({ key: 'obligations', label: copy.exportObligations, run: exportObligations });
  actions.push({ key: 'map', label: copy.exportMap, run: exportMap });

  // a question with three answers; called as a function so its radios keep focus across renders
  const tri = (k: QuestionKey) => (
    <fieldset key={k} className="rb-tri">
      <legend>{copy[`q${k[0].toUpperCase()}${k.slice(1)}`]}</legend>
      <div className="lab-choice">
        {(['yes', 'no', 'unsure'] as Tri[]).map((t) => (
          <label key={t}>
            <input type="radio" name={`rb-${k}`} checked={a.q[k] === t} onChange={() => setQ(k, t)} />
            <span>{copy[t]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="rb" data-live={ready ? '' : undefined}>
      {/* ---- worked examples: one at a time in a slot of fixed height; a still list under reduced motion ---- */}
      <div
        className={`rb-ex${exRunning ? ' is-turning' : ''}`}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setExHover(true);
        }}
        onPointerLeave={() => setExHover(false)}
        onFocus={() => setExFocus(true)}
        onBlur={leaveExamples}
      >
        <p id="rb-ex-h" className="rb-ex-label">{copy.examplesLabel}</p>
        <ul className="rb-ex-slot" aria-labelledby="rb-ex-h">
          {WORKED_EXAMPLES.map((ex, i) => {
            const href = answersToSearch(ex.a);
            return (
              <li key={ex.id} className={i === exIndex ? 'is-on' : undefined}>
                <a href={href} aria-current={href === currentExample ? 'true' : undefined} onClick={(e) => pickExample(e, ex.a)} onFocus={() => setExIndex(i)}>
                  <span>{copy[`ex${ex.id[0].toUpperCase()}${ex.id.slice(1)}`]}</span>
                  <span className="rb-ex-arrow" aria-hidden="true">→</span>
                </a>
              </li>
            );
          })}
        </ul>
        <button type="button" className="rb-ex-toggle" aria-label={exPlaying ? copy.examplesPauseLabel : copy.examplesPlayLabel} onClick={() => setExPlaying((p) => !p)}>
          {exPlaying ? <PauseIcon /> : <PlayIcon />}
          <span>{exPlaying ? copy.examplesPause : copy.examplesPlay}</span>
        </button>
      </div>

      {/* ---- questions ---- */}
      <form className="rb-form" onSubmit={(e) => e.preventDefault()}>
        <fieldset className="rb-step lab-group">
          <legend className="section-label">{copy.stepBasics}</legend>
          <div className="rb-basics">
            <div className="rb-field">
              <label htmlFor="rb-sector" className="rb-field-label">{copy.sectorLabel}</label>
              <select id="rb-sector" ref={sectorRef} className="lab-select" value={a.sector ?? ''} onChange={(e) => setA((s) => ({ ...s, sector: e.target.value || null }))}>
                <option value="">{copy.sectorPlaceholder}</option>
                {(['I', 'II'] as const).map((annex) => (
                  <optgroup key={annex} label={annex === 'I' ? copy.sectorAnnexI : copy.sectorAnnexII}>
                    {sectors.filter((s) => s.annex === annex).flatMap((s) => [
                      <option key={s.id} value={s.id}>{s.label}</option>,
                      // a subsector names its sector, so "Water" reads "Transport: Water" in the closed select too
                      ...s.subsectors.map((x) => <option key={x.id} value={x.id}>{`${s.label}: ${x.label}`}</option>),
                    ])}
                  </optgroup>
                ))}
                <option value="none">{copy.sectorNone}</option>
              </select>
            </div>
            <fieldset className="rb-field rb-size">
              <legend className="rb-field-label">{copy.sizeLabel}</legend>
              <div className="lab-choice">
                {sizeClasses.map((c) => (
                  <label key={c.id} title={c.description}>
                    <input type="radio" name="rb-size" checked={a.size === c.id} onChange={() => setA((s) => ({ ...s, size: c.id as Answers['size'] }))} />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
              {/* two lines are kept for the definition, so choosing a size moves nothing under it */}
              <p className="rb-help rb-help--fixed">{sizeClasses.find((c) => c.id === a.size)?.description ?? copy.sizeSource}</p>
            </fieldset>
            <div className="rb-field">
              <label htmlFor="rb-in" className="rb-field-label">{copy.establishedLabel}</label>
              <select id="rb-in" className="lab-select" value={a.established ?? ''} onChange={(e) => setA((s) => ({ ...s, established: e.target.value || null }))} aria-describedby="rb-in-note">
                <option value="">{copy.establishedPlaceholder}</option>
                {memberStates.map((ms) => (
                  <option key={ms.iso3} value={ms.iso3}>{ms.name}</option>
                ))}
                <option value="outside">{copy.establishedOutside}</option>
              </select>
              <p id="rb-in-note" className="rb-help">{copy.establishedNote}</p>
              {/* the profile line keeps its room whenever profiles are offered, so it never pushes the form */}
              {hasProfiles && (
                <p className="rb-profile">
                  {country && profileHref && (
                    <a href={profileHref}>
                      {fill(copy.establishedProfile, { country: country.name })}
                      <span aria-hidden="true">↗</span>
                    </a>
                  )}
                </p>
              )}
            </div>
          </div>
        </fieldset>

        <details className="rb-step rb-more lab-group">
          <summary>
            <span className="section-label">{copy.stepMore}</span>
            {answered > 0 && <span className="rb-answered mono">{fill(copy.moreAnswered, { n: answered, total: QUESTION_KEYS.length })}</span>}
          </summary>
          <p className="rb-help">{copy.stepMoreHint}</p>
          <div className="rb-tris">{QUESTION_KEYS.map((k) => tri(k))}</div>
        </details>
      </form>

      {/* ---- the outcome: which acts plausibly apply; each row opens on its reasons ---- */}
      <section className="lab-section rb-outcomes" aria-labelledby="rb-outcomes-h">
        <div className="rb-head">
          <h2 id="rb-outcomes-h" className="section-h">{copy.outcomesHeading}</h2>
          <button type="button" className={`rb-reset${started ? '' : ' is-idle'}`} onClick={startAgain} disabled={!started}>
            {copy.reset}
          </button>
        </div>
        <p className="rb-sr" aria-live="polite">{outcomeLine}</p>
        <div ref={outBox}>
          {started ? (
            <ul className="rb-outcome-list">
              {results.map((r, i) => {
                const refs = [...new Set(r.reasons.map((x) => x.articleRef))].join('; ');
                return (
                  <li key={r.instrument} data-flip={r.instrument} className={outcomeClass(r.outcome)} style={{ '--i': i } as CSSProperties}>
                    <details className="rb-why">
                      <summary>
                        <span className="rb-ins mono">{shortOf(r.instrument)}</span>
                        <span className="rb-mark" aria-hidden="true" />
                        <span key={r.outcome ?? ''} className="rb-outcome-label rb-enter">{r.outcome ? copy[r.outcome] : ''}</span>
                        <span className="rb-arts mono">{refs}</span>
                      </summary>
                      <div className="rb-reasons">
                        {r.reasons.length === 0 && <p className="rb-reason">{copy.noReason}</p>}
                        {r.reasons.map((reason) => (
                          <p key={reason.ruleId} className="rb-reason">{fill(copy.reasonLine, { reason: reason.text, articleRef: reason.articleRef })}</p>
                        ))}
                        <p className="rb-reason">
                          <a href={eurlexOf(r.instrument)} rel="noopener">{fill(copy.outcomeRead, { act: shortOf(r.instrument) })}</a>
                        </p>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rb-empty">{copy.outcomesEmpty}</p>
          )}
        </div>
      </section>

      {/* ---- reporting deadlines: how many reports one incident can start, and when they fall due ---- */}
      <section className="lab-section rb-dl" aria-labelledby="rb-dl-h">
        <div className="rb-head">
          <h2 id="rb-dl-h" className="section-h">{copy.deadlinesHeading}</h2>
          {shownRegimes.length > 0 && (
            <div className="rb-dl-buttons">
              {cursor !== null && <span className="rb-due mono" aria-hidden="true">{`${dueLine}, ${when(cursor)}`}</span>}
              {cursor !== null && !running && (
                <button
                  type="button"
                  className="lab-btn"
                  onClick={() => {
                    resetPlay();
                    playRef.current?.focus(); // the Reset button goes, so focus moves to the play button
                  }}
                >
                  {copy.deadlinesReset}
                </button>
              )}
              <button ref={playRef} type="button" className="lab-btn lab-btn--primary" onClick={running ? stopPlay : play}>
                {running ? copy.deadlinesPause : copy.deadlinesPlay}
              </button>
            </div>
          )}
        </div>
        <p className="rb-sr" aria-live="polite">{announce}</p>
        <div ref={dlBox}>
          {!started ? (
            <p className="rb-empty">{copy.deadlinesEmpty}</p>
          ) : shownRegimes.length === 0 ? (
            <p className="rb-empty">{copy.deadlinesNone}</p>
          ) : (
            <p key={`${n}-${m}`} className="rb-sentence rb-enter">{monoFill(copy.deadlinesSentence, { n, m })}</p>
          )}
          {/* the stage is always there, so its width is known before the first row is drawn */}
          <div className={`rb-dl-stage${compact ? ' is-compact' : ''}`} ref={dlRef}>
            {shownRegimes.length > 0 &&
              (!dlMeasured ? (
                <p className="lab-state">{copy.deadlinesDrawing}</p>
              ) : (
                <ol className="rb-drows">
                  <li className="rb-drow rb-drow-axis" aria-hidden="true">
                    {!compact && <span />}
                    <svg className="rb-drow-track" viewBox={`0 0 ${TW} 22`} width={TW} height={22}>
                      {TICKS.map((t) => (
                        <line key={t.h} className="rb-tick-mark" x1={x(t.h)} x2={x(t.h)} y1={16} y2={22} />
                      ))}
                      {tickLabels.map((t) => (
                        <text key={t.h} className="rb-tick" x={x(t.h)} y={12} textAnchor={t.anchor}>{t.label}</text>
                      ))}
                    </svg>
                  </li>
                  {shownRegimes.map((r) => {
                    const times = stepTimes(r, inputs);
                    const rowProposals = overlay ? touchingProposals(proposals, regimeArticleKey(r)) : [];
                    return (
                      <li key={r.id} data-flip={r.id} className="rb-drow rb-enter">
                        <div className="rb-drow-label">
                          <p className="rb-drow-head">
                            <span className="rb-drow-ins mono">{r.shortLabel}</span> {r.who}
                          </p>
                          <p className="rb-drow-meta">{fill(copy.deadlinesMeta, { event: r.steps[0].from, recipient: lowerThe(r.recipient) })}</p>
                        </div>
                        <svg
                          className="rb-drow-track"
                          viewBox={`0 0 ${TW} ${TRACK_H}`}
                          width={TW}
                          height={TRACK_H}
                          role="img"
                          aria-label={`${r.shortLabel}: ${times.map(({ step, dueHours }) => fill(copy.stepDue, { label: step.label, when: when(dueHours) })).join('; ')}`}
                        >
                          {TICKS.map((t) => (
                            <line key={t.h} className="rb-grid" x1={x(t.h)} x2={x(t.h)} y1={0} y2={TRACK_H} />
                          ))}
                          <line className="rb-baseline" x1={x(1)} x2={x(MAX_H)} y1={TRACK_Y} y2={TRACK_Y} />
                          {/* a bracket marks a deadline counted from later than the incident: from classification or from a fix */}
                          {times.map(({ step, startHours, dueHours }, k) => {
                            const px = x(Math.min(MAX_H, dueHours));
                            const passed = cursor !== null && dueHours <= cursor;
                            return (
                              <g key={step.id} className={`rb-step-mark${passed ? ' is-due' : ''}`}>
                                {startHours > 0 && (step.fromKind === 'classified' || step.fromKind === 'fix') && (
                                  <path className="rb-bracket" d={`M${x(Math.max(1, startHours))},${TRACK_Y - 8} V${TRACK_Y - 12} H${px} V${TRACK_Y - 8}`} />
                                )}
                                <line x1={px} x2={px} y1={TRACK_Y - 8} y2={TRACK_Y + 8} />
                                <text x={px} y={TRACK_Y + 24 + (k % 2) * 14} textAnchor={anchorAt(px, step.label.length * 7.2, TW)}>{step.label}</text>
                              </g>
                            );
                          })}
                          {cursor !== null && <line className="rb-cursor" x1={x(cursor)} x2={x(cursor)} y1={0} y2={TRACK_H} />}
                        </svg>
                        {rowProposals.length > 0 && (
                          <div className="rb-drow-notes">
                            {rowProposals.map((p) => (
                              <p key={p.id} className="rb-ghost">{proposalLabel(p)}</p>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ))}
          </div>
        </div>
        {/* the values the visitor supplies for the rows counted from them: said in the summary, changed inside */}
        {(classifiedBy || fixBy) && (
          <details className="rb-fold rb-assume lab-disclose">
            <summary>
              <span>{copy.deadlinesAssumeSummary}</span>
              <span className="rb-fold-note mono">
                {[
                  classifiedBy && fill(copy.deadlinesAssumeClassifiedShort, { instrument: classifiedBy, n: inputs.classifiedAfterHours, unit: unit(inputs.classifiedAfterHours, 'hours') }),
                  fixBy && fill(copy.deadlinesAssumeFixShort, { instrument: fixBy, n: inputs.fixAfterDays, unit: unit(inputs.fixAfterDays, 'days') }),
                ]
                  .filter(Boolean)
                  .join('; ')}
              </span>
            </summary>
            <div className="rb-inputs">
              {classifiedBy && (
                <label>
                  <span>{fill(copy.deadlinesClassified, { instrument: classifiedBy })}</span>
                  <span className="rb-input-unit">
                    <input type="number" min={0} max={24} value={inputs.classifiedAfterHours} aria-describedby="rb-assume-note" onChange={(e) => setInputs((s) => ({ ...s, classifiedAfterHours: Math.max(0, Math.min(24, Number(e.target.value) || 0)) }))} />
                    <span>{copy.hoursUnit}</span>
                  </span>
                </label>
              )}
              {fixBy && (
                <label>
                  <span>{fill(copy.deadlinesFix, { instrument: fixBy })}</span>
                  <span className="rb-input-unit">
                    <input type="number" min={0} max={40} value={inputs.fixAfterDays} aria-describedby="rb-assume-note" onChange={(e) => setInputs((s) => ({ ...s, fixAfterDays: Math.max(0, Math.min(40, Number(e.target.value) || 0)) }))} />
                    <span>{copy.daysUnit}</span>
                  </span>
                </label>
              )}
            </div>
            <p id="rb-assume-note" className="rb-help">{copy.deadlinesAssumed}</p>
          </details>
        )}
        {/* an act whose reporting deadlines are not drawn says so, with its reason one click away */}
        {hiddenRegimes.map((r) => (
          <details key={r.id} className="rb-fold rb-hidden lab-disclose">
            <summary>{fill(copy.deadlinesHiddenShort, { instrument: r.shortLabel })}</summary>
            <p className="rb-help">{r.hiddenReason}</p>
          </details>
        ))}
        {shownRegimes.length > 0 && (
          <details className="lab-table rb-table">
            <summary>{copy.tableSummary}</summary>
            <table className="is-stack">
              <caption>{copy.tableDeadlines}</caption>
              <thead>
                <tr>
                  <th scope="col">{copy.colInstrument}</th>
                  <th scope="col">{copy.colStep}</th>
                  <th scope="col">{copy.colLimit}</th>
                  <th scope="col">{copy.colFrom}</th>
                  <th scope="col">{copy.colRecipient}</th>
                  <th scope="col">{copy.colSetBy}</th>
                  <th scope="col">{copy.colApplies}</th>
                </tr>
              </thead>
              <tbody>
                {shownRegimes.flatMap((r) =>
                  r.steps.map((s) => (
                    <tr key={`${r.id}-${s.id}`}>
                      <th scope="row">{regimeHead(r)}</th>
                      <td data-label={copy.colStep}>{s.label}</td>
                      <td data-label={copy.colLimit} className="mono">{s.within} {unit(s.within, s.unit)}</td>
                      <td data-label={copy.colFrom}>{s.from}</td>
                      <td data-label={copy.colRecipient}>{r.recipient}</td>
                      <td data-label={copy.colSetBy}>{s.locator}</td>
                      <td data-label={copy.colApplies}>{regimeApplies(r)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </details>
        )}
      </section>

      {/* ---- everything else, behind one disclosure: the article map, its panel, the proposals and the table ---- */}
      <details className="lab-section rb-detail lab-disclose" open={detailOpen} onToggle={(e) => setDetailOpen(e.currentTarget.open)}>
        <summary>
          <h2 className="section-h">{copy.detailsSummary}</h2>
        </summary>
        <div className="rb-map">
          <div className="rb-map-head">
            <p className="rb-help">{copy.detailsHint}</p>
            <div className="lab-switch" role="group" aria-label={copy.overlayToggle}>
              <span className="lbl" aria-hidden="true">{copy.overlayToggle}</span>
              <button type="button" aria-pressed={!overlay} onClick={() => setOverlay(false)}>{copy.overlayOff}</button>
              <button type="button" aria-pressed={overlay} onClick={() => setOverlay(true)}>{copy.overlayOn}</button>
            </div>
          </div>
          <div className={`rb-map-body${selected ? ' has-panel' : ''}`}>
            <div className="rb-map-stage" ref={mapRef}>
              {!mapMeasured ? (
                <p className="lab-state">{copy.mapDrawing}</p>
              ) : (
                <svg className="rb-map-svg" viewBox={`0 0 ${MW} ${map.height}`} width={MW} height={map.height} role="group" aria-label={copy.mapHeading}>
                  {instruments.map((ins, i) => (
                    <text key={ins.celex} className={`rb-col-label${started && outcomeOf(ins.celex) === 'appears-to-apply' ? ' is-on' : ''}`} x={colX(i)} y={mapCompact ? 14 : 20} textAnchor="middle">{ins.short}</text>
                  ))}
                  {map.bands.map((b) => (
                    <g key={b.theme}>
                      <line className="rb-map-rule" x1={0} x2={MW} y1={b.ruleY} y2={b.ruleY} />
                      <text className="rb-row-theme" x={0} y={b.labelY}>{themeLabel(b.theme)}</text>
                    </g>
                  ))}
                  {/* cross-references, drawn for the dot in focus; the panel and the table list them as text */}
                  {focusDot &&
                    (articleByKey.get(focusDot)?.crossRefs ?? []).map((target) => {
                      const p0 = map.pos.get(focusDot);
                      const p1 = map.pos.get(target);
                      if (!p0 || !p1) return null;
                      const mx = r2((p0[0] + p1[0]) / 2);
                      const my = r2(Math.min(p0[1], p1[1]) - 40 - Math.abs(p0[0] - p1[0]) * 0.08);
                      return <path key={target} className="rb-xref" d={`M${p0[0]},${p0[1]} Q${mx},${my} ${p1[0]},${p1[1]}`} />;
                    })}
                  {articles.map((art: RbArticle) => {
                    const p = map.pos.get(art.key);
                    if (!p) return null;
                    const solid = started && outcomeOf(art.celex) === 'appears-to-apply';
                    const proposed = overlay && touchingProposals(proposals, art.key).length > 0;
                    const isSel = sel === art.key;
                    const num = art.ref.replace('Article ', '');
                    const lw = r2(num.length * DOT_CHAR);
                    return (
                      <g
                        key={art.key}
                        data-key={art.key}
                        className={`rb-dot${solid ? ' is-solid' : ''}${isSel ? ' is-selected' : ''}`}
                        transform={`translate(${p[0]}, ${p[1]})`}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSel}
                        aria-label={`${shortOf(art.celex)} ${art.ref}: ${art.title}${proposed ? `. ${copy.mapProposalMark}` : ''}`}
                        onPointerEnter={() => setFocusDot(art.key)}
                        onPointerLeave={() => setFocusDot(null)}
                        onFocus={() => setFocusDot(art.key)}
                        onBlur={() => setFocusDot(null)}
                        onClick={() => choose(art.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            choose(art.key);
                          }
                        }}
                      >
                        <circle r={22} className="rb-dot-hit" />
                        <circle r={10.5} className="rb-dot-ring" />
                        {proposed && <rect className="rb-proposal-box" x={-10} y={-10} width={20} height={20} />}
                        <circle r={6} className="rb-dot-mark" />
                        {/* the selected article is marked by a rule under its number, so the focus ring keeps one meaning */}
                        {mapCompact ? (
                          <>
                            <text className="rb-dot-label" x={14} y={3.5}>{num}</text>
                            {isSel && <line className="rb-dot-sel" x1={14} x2={r2(14 + lw)} y1={6.5} y2={6.5} />}
                          </>
                        ) : (
                          <>
                            <text className="rb-dot-label" y={20} textAnchor="middle">{num}</text>
                            {isSel && <line className="rb-dot-sel" x1={r2(-lw / 2)} x2={r2(lw / 2)} y1={22.5} y2={22.5} />}
                          </>
                        )}
                      </g>
                    );
                  })}
                </svg>
              )}
              {/* the map's key: set in ink-muted so it reads at 4.5:1, like the overlay key under it */}
              <p className="rb-key">{copy.mapHint}</p>
              {overlay && <p className="rb-key">{copy.mapOverlayKey}</p>}
            </div>
            {selected && (
              <aside className="rb-panel lab-group" ref={panelRef} aria-labelledby="rb-panel-h">
                <div className="rb-panel-head">
                  <div>
                    <p className="rb-panel-ins mono">{shortOf(selected.celex)} {selected.ref}</p>
                    <h3 id="rb-panel-h" ref={panelHeadRef} tabIndex={-1}>{selected.title}</h3>
                  </div>
                  <button type="button" className="rb-close" onClick={closePanel} aria-label={copy.articleClose}>
                    <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" /></svg>
                  </button>
                </div>
                {selObligations.length === 0 ? (
                  <p className="rb-help">{copy.articleNoObligations}</p>
                ) : (
                  <h4 className="section-label">{copy.articleObligations}</h4>
                )}
                {allDraft && <p className="rb-help">{copy.obligationsDraftAll}</p>}
                {sharedStatus && <p className="rb-help">{fill(copy.obligationsStatusAll, { status: sharedStatus })}</p>}
                {selObligations.map((o) => (
                  <div key={o.id} className="rb-obligation">
                    <p className="rb-ob-who">{fill(copy.obligationFor, { addressee: o.addressee })}</p>
                    <p className="rb-ob-action">
                      <span className="rb-ob-k">{copy.obligationAction}</span> {o.action}
                      {!o.verified && !allDraft && <span className="rb-flag"> ({copy.obligationDraft})</span>}
                    </p>
                    {showSource && o.sentence && (
                      <blockquote cite={o.url}>
                        <p>{o.sentence}</p>
                      </blockquote>
                    )}
                    <p className="rb-help mono">{sharedStatus ? o.articleRef : `${o.articleRef}: ${statusLine(o)}`}</p>
                  </div>
                ))}
                {selRefs.length > 0 && (
                  <>
                    <h4 className="section-label">{copy.articleRefersTo}</h4>
                    <ul className="rb-refs">
                      {selRefs.map((k) => (
                        <li key={k}>
                          <button type="button" className="rb-ref" onClick={() => goTo(k)}>{nameOf(k)}</button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {selText.length > 0 && (
                  <details className="rb-text">
                    <summary>{copy.articleText}</summary>
                    {selText.map((p) => (
                      <p key={p.id}>
                        <span className="mono rb-pref">{p.ref}</span> {p.quote}
                      </p>
                    ))}
                  </details>
                )}
                {selProposals.length > 0 && (
                  <>
                    <h4 className="section-label">{copy.articleProposals}</h4>
                    {selProposals.map((p) => (
                      <div key={p.id} className="rb-proposal-note">
                        <p className="rb-proposal-label">{proposalLabel(p)}</p>
                        {p.touches.filter((t) => t.articleKey === selected.key).map((t, i) => (
                          <p key={i}>{t.summary}</p>
                        ))}
                      </div>
                    ))}
                  </>
                )}
                <p className="rb-read"><a href={selected.eurlex} rel="noopener">{copy.articleRead}</a></p>
              </aside>
            )}
          </div>
          <p className="rb-sr" aria-live="polite">{selected ? `${shortOf(selected.celex)} ${selected.ref}: ${selected.title}` : ''}</p>
          <details className="lab-table rb-table">
            <summary>{copy.tableSummary}</summary>
            <table className="is-stack">
              <caption>{copy.tableArticles}</caption>
              <thead>
                <tr>
                  <th scope="col">{copy.colArticle}</th>
                  <th scope="col">{copy.colTheme}</th>
                  <th scope="col">{copy.colOutcome}</th>
                  <th scope="col">{copy.colRefersTo}</th>
                  {overlay && <th scope="col">{copy.colProposal}</th>}
                </tr>
              </thead>
              <tbody>
                {articles.map((art) => {
                  const o = started ? outcomeOf(art.celex) : null;
                  return (
                    <tr key={art.key}>
                      <th scope="row">{shortOf(art.celex)} {art.ref}: {art.title}</th>
                      <td data-label={copy.colTheme}>{themeLabel(art.theme)}</td>
                      <td data-label={copy.colOutcome}>{o ? copy[o] : ''}</td>
                      <td data-label={copy.colRefersTo}>{art.crossRefs.map(nameOf).join('; ')}</td>
                      {overlay && <td data-label={copy.colProposal}>{touchingProposals(proposals, art.key).map((p) => fill(copy.tableProposalCell, { com: p.com })).join('; ')}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </div>
      </details>

      {/* ---- quiet actions: mono text links joined by middle dots ---- */}
      <div className="share-bar rb-actions">
        {actions.map((act, i) => (
          <Fragment key={act.key}>
            {i > 0 && <span className="dot-sep" aria-hidden="true" />}
            <button type="button" className="share-btn" onClick={act.run}>
              {act.label}
            </button>
          </Fragment>
        ))}
        <p className="share-status" aria-live="polite">{status}</p>
      </div>
    </div>
  );
}
