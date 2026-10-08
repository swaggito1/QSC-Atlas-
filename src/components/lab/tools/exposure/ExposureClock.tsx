// QSC Atlas Labs: the Exposure Clock island. Controls, chart, readout, the target dates
// published for the chosen place, table and share, with the whole view kept in the query string
// so a copied link reproduces it. The first render uses the build's defaults so the
// server-rendered chart and the hydrated one match; the visitor's clock and URL are read after
// hydration. Every href comes in through props (links), built at build time, so the island
// holds no route string. Presentation mode has no control on the page: ?present=1 opens it, and
// "Leave presentation mode" or Escape closes it. The rail asks the page's own question first:
// how long the data must stay secret, then how long the migration takes, then where and what.
// Choosing what you protect starts the first slider from the period a source documents for that
// kind of data (the place's own, an EU rule, or a general one), named under the slider with its
// source and what kind of period it is; where the Atlas holds none, the note says so plainly. The
// source's own words travel only in a build that may carry them and show only with ?review=1.
//
// Smoothness: a slider's handle and figure follow the pointer at once, and the chart follows once
// per animation frame however many input events the browser sends; the parts of the page a
// slider cannot change (the place's dates, the tables, the options) are kept from one render to
// the next instead of being drawn again. The readout keeps room for its longest wording, and the
// chart's height depends only on the place, so nothing below them moves while a value changes.
// Before the island knows its width, the server's chart is drawn at the two widths a visitor
// most often has (a phone, the desktop column) and at a tablet's, and the page shows the one
// that fits, so the first paint holds the chart at its own height.

import { Component, memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ExposureChart, { DeadlineMark } from './ExposureChart';
import ShareBar from '../../ShareBar';
import {
  LIMITS,
  START_SPAN,
  computeExposure,
  fill,
  initialState,
  listText,
  periodFor,
  placesWithPeriod,
  readoutSentences,
  shelfLifeAfterChoice,
  startingYears,
  stateToSearch,
  surveySentences,
} from '../../../../lib/lab/exposure';
import type { ClockDeadline, ClockState, ShelfPeriod, ShelfScope } from '../../../../lib/lab/exposure';
import type { ClockPreset, ExposureData } from '../../../../lib/lab/exposure-data';
import { reviewRequested } from '../../../../lib/site/review';
import { useFrameCoalescer, useReducedMotion } from './motion';

type Props = Omit<ExposureData, 'decisions' | 'sources' | 'asOf' | 'frame' | 'surveyDefinition'> & {
  asOfLabel: string;
  sourceWordsAvailable?: boolean; // sourceWordsInBuild(), from the server
};

const DEFAULTS: ClockState = { c: 'other', j: 'none', x: 10, y: 7, s: null, view: 'all', present: false };

// presentation mode lays a wide chart out this much narrower, so its type is this much larger
const PRESENT_SCALE = 1.3;

// the widths the server draws the chart at, before the island has measured its own: a 390px
// phone, the desktop column and a tablet (lab-exposure.css shows the one that fits)
const FIRST_WIDTHS = [342, 464, 720] as const;

// the address bar follows the view once the visitor pauses, not on every step of a drag
const URL_PAUSE_MS = 300;
// a screen reader hears the readout once the values have settled
const SPEAK_PAUSE_MS = 700;

class ChartBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Wrap four-digit years in a mono span so the numbers in a sentence read as data; a title keeps its own. */
function withYears(text: string, keep: string[] = []) {
  const titles = keep.filter(Boolean);
  const pattern = titles.length ? new RegExp(`(${titles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`) : null;
  const pieces = pattern ? text.split(pattern) : [text];
  return pieces.flatMap((piece, j) =>
    titles.includes(piece)
      ? [piece]
      : piece.split(/(\b\d{4}\b)/).map((part, i) => (/^\d{4}$/.test(part) ? <span key={`${j}-${i}`} className="mono xc-num">{part}</span> : part)),
  );
}

const plainYear = (n: number) => String(n);
const NO_ROOM: string[] = [];
const fitX = (v: number) => Math.min(LIMITS.x[1], Math.max(LIMITS.x[0], Math.round(v)));

/**
 * The note under the first slider once a kind of data is chosen. With a period: the value and the
 * rule in the Atlas's words, then what kind of period it is and the source's name, linked; the
 * source's own words only in review. Without one: a plain sentence saying the Atlas holds none for
 * this place, and where it holds one.
 */
export const ShelfNote = memo(function ShelfNote(props: {
  copy: Record<string, string>;
  preset: Pick<ClockPreset, 'label'> | null;
  found: { period: ShelfPeriod; scope: ShelfScope } | null;
  place: string; // ISO3, "EUU" or "none"
  placeName: string; // inside a sentence: "Spain", "the European Union"
  elsewhere: string[]; // the places that hold a period for this kind of data
  x: number;
  useShown: boolean;
  showWords: boolean;
  onUse?: (years: number) => void;
}) {
  const { copy, preset, found, place, placeName, elsewhere, x, useShown, showWords, onUse } = props;
  if (!preset) return null;
  if (!found) {
    const kind = preset.label.charAt(0).toLowerCase() + preset.label.slice(1);
    const places = listText(elsewhere, copy.listAnd);
    return (
      <p className="xc-note">
        {place === 'none' ? fill(copy.shelfNoneGeneral, { kind }) : fill(copy.shelfNone, { kind, place: placeName })}
        {elsewhere.length > 0 && ` ${fill(place === 'none' ? copy.shelfChoosePlace : copy.shelfElsewhere, { places })}`}
      </p>
    );
  }
  const p = found.period;
  const fit = fitX(startingYears(p)!);
  const basisWords = p.basis === 'confidentiality' ? copy.basisConfidentiality : p.basis === 'closure' ? copy.basisClosure : copy.basisRetention;
  return (
    <p className="xc-note">
      {p.years === null
        ? `${fill(copy.shelfNoEnd, { max: LIMITS.x[1] })} ${p.basisNote}`
        : p.years > LIMITS.x[1]
          ? `${fill(copy.shelfOverMax, { years: p.years, max: LIMITS.x[1] })} ${p.basisNote}`
          : fill(copy.shelfDefault, { years: p.years, basisNote: p.basisNote })}{' '}
      <span className="xc-shelf-src">
        {basisWords} {copy.shelfFrom}{' '}
        <a href={p.sourceUrl} rel="noopener">{p.sourceName}</a>
        {showWords && p.words.map((w, i) => <span key={i} className="src-words">“{w}”</span>)}
        {!p.verified && <span className="xc-flag"> {copy.notVerified}</span>}
      </span>
      {useShown && (
        // at the sourced period the action has nothing to do: it keeps its line but is hidden
        <button type="button" className={`xc-textlink${fit === x ? ' is-spent' : ''}`} onClick={() => onUse?.(fit)}>
          {fill(copy.shelfUseDefault, { years: fit })}
        </button>
      )}
    </p>
  );
});

const Slider = memo(function Slider(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: (n: number) => string;
  onChange: (n: number) => void;
  note?: ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const { id, label, value, min, max, unit, onChange, note, inputRef } = props;
  // the handle and the figure beside it follow the pointer at once; the page follows once a frame
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // a change from outside: a sourced period, "Use N years", the link the page was opened with
    setSeen(value);
    setDraft(value);
  }
  const commit = useFrameCoalescer(onChange);
  const move = (n: number) => {
    setDraft(n);
    commit(n);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      move(Math.min(max, Math.max(min, draft + (e.key === 'PageUp' ? 5 : -5))));
    }
  };
  const pct = ((draft - min) / (max - min)) * 100;
  return (
    <div className="xc-field">
      <div className="xc-slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="mono xc-value">{unit(draft)}</output>
      </div>
      <input
        ref={inputRef}
        id={id}
        className="xc-range"
        type="range"
        min={min}
        max={max}
        step={1}
        value={draft}
        aria-valuetext={unit(draft)}
        style={{ '--xc-fill': `${pct}%` } as React.CSSProperties}
        onChange={(e) => move(Number(e.target.value))}
        onKeyDown={onKey}
      />
      <div className="xc-slider-ends mono" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {note}
    </div>
  );
});

/** Every other wording a readout sentence can take, laid out but unseen; it never changes during a drag. */
const Room = memo(function Room({ texts, keep }: { texts: string[]; keep: string[] }) {
  return (
    <>
      {texts.map((t, k) => (
        <p key={k} className="xc-room" aria-hidden="true">
          {withYears(t, keep)}
        </p>
      ))}
    </>
  );
});

/**
 * The three readout sentences. Each shares one grid cell with every other wording it can take,
 * laid out but unseen, so the cell is as tall as the longest and the page below never moves.
 */
const Readout = memo(function Readout({ sentences, room, keep, standing }: { sentences: string[]; room: string[][]; keep: string[]; standing: string }) {
  return (
    <div className="xc-readout">
      {sentences.map((s, i) => (
        <div key={i} className={i === 2 ? 'xc-line xc-readout-survey' : 'xc-line'}>
          <p>{withYears(s, keep)}</p>
          <Room texts={room[i] ?? NO_ROOM} keep={keep} />
        </div>
      ))}
      <p className="xc-standing">{standing}</p>
    </div>
  );
});

export default function ExposureClock(props: Props) {
  const { copy, survey, surveyRows, surveyStale, presets, jurisdictions, deadlines, links, postures, buildYear, origin, asOfLabel, sourceWordsAvailable = false } = props;
  const [st, setSt] = useState<ClockState>(DEFAULTS);
  const [year, setYear] = useState(buildYear);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(760);
  // false until the chart's own width is known: until then the server's charts stand in
  const [measured, setMeasured] = useState(false);
  const [focused, setFocused] = useState<string[]>([]);
  // motion only explains a change the visitor makes: nothing glides into place on load
  const [animated, setAnimated] = useState(false);
  const reduced = useReducedMotion();
  // "Use N years" keeps its line once it has appeared for a choice, so moving the slider back
  // and forth across the sourced period does not move what is under it
  const [useShown, setUseShown] = useState(false);
  // the sources' own words, for review only: set after mounting, so both first renders agree
  const [showWords, setShowWords] = useState(false);
  const [spoken, setSpoken] = useState('');
  const firstSpoken = useRef<string | null>(null);
  const chartRef = useRef<HTMLElement>(null);
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const tableRef = useRef<HTMLDetailsElement>(null);
  const firstControl = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  // the last shelf life the visitor set themselves, which a sourced period gives back when it stops applying
  const userX = useRef(DEFAULTS.x);
  const uid = useId();

  // the period a kind of data starts the shelf life from, at a place: its own, an EU rule that
  // reaches a Member State, or the general one
  const euMember = useCallback((iso3: string) => jurisdictions.some((j) => j.iso3 === iso3 && j.eu), [jurisdictions]);
  const periodAt = useCallback(
    (c: string, j: string) => {
      const p = presets.find((x) => x.id === c);
      return p ? periodFor(p.periods, j, euMember) : null;
    },
    [presets, euMember],
  );
  const sourcedYears = useCallback((c: string, j: string) => startingYears(periodAt(c, j)?.period ?? null), [periodAt]);

  // after hydration: the visitor's own clock and the view in the URL. A link that names what and
  // where but no shelf life starts the slider at the sourced period, as choosing them here would.
  useEffect(() => {
    const now = new Date();
    const { state: parsed, userX: own } = initialState(window.location.search, DEFAULTS, now.getFullYear(), sourcedYears);
    userX.current = own;
    setYear(now.getFullYear());
    setSt(parsed);
    // a link that sets the migration start opens the panel that holds it, once; after that the
    // panel is the visitor's to open and close
    if (parsed.s !== null && advancedRef.current) advancedRef.current.open = true;
    // on a phone the tables start open (spec 11, item 11); this runs once, so from then on the
    // disclosure is the visitor's to open and close
    if (tableRef.current && window.matchMedia('(max-width: 639px)').matches) tableRef.current.open = true;
    const review = sourceWordsAvailable && reviewRequested();
    setShowWords(review);
    if (review) document.documentElement.classList.add('is-review');
    setReady(true);
    timer.current = window.setTimeout(() => setAnimated(true), 400);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the address bar is written once the visitor pauses: some browsers refuse more than about a
  // hundred address changes in thirty seconds, and a drag would spend them in a second
  // (a page opened for review keeps ?review=1, so a reload still shows the source words)
  useEffect(() => {
    if (!ready) return;
    const search = stateToSearch(st) + (showWords ? '&review=1' : '');
    const id = window.setTimeout(() => window.history.replaceState(null, '', window.location.pathname + search + window.location.hash), URL_PAUSE_MS);
    return () => window.clearTimeout(id);
  }, [st, ready, showWords]);
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
      setMeasured(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // presentation mode, opened only by ?present=1: the page's frame steps back (lab-exposure.css),
  // and Escape leaves it
  useEffect(() => {
    document.documentElement.classList.toggle('xc-presenting', st.present);
    if (!st.present) return () => document.documentElement.classList.remove('xc-presenting');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) leavePresentation();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('xc-presenting');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.present]);

  const now = useMemo(() => new Date(Date.UTC(year, 6, 1)), [year]);
  const result = useMemo(
    () => computeExposure({ now, shelfLifeYears: st.x, migrationYears: st.y, migrationStartYear: st.s ?? undefined }),
    [now, st.x, st.y, st.s],
  );
  const sentences = useMemo(() => readoutSentences(result, { migrationYears: st.y }, survey, copy as never), [result, st.y, survey, copy]);
  // every other wording each sentence can take, laid out unseen to hold the readout's height
  const room = useMemo(() => {
    const longest = computeExposure({ now, shelfLifeYears: LIMITS.x[1], migrationYears: LIMITS.y[1], migrationStartYear: now.getUTCFullYear() + START_SPAN });
    const second = [1, 8, 18, LIMITS.y[1]].map((n) => readoutSentences(longest, { migrationYears: n }, survey, copy as never)[1]);
    return [[], second, surveySentences(survey, copy as never)];
  }, [now, survey, copy]);
  const keepTitles = useMemo(() => [survey?.title ?? ''], [survey]);
  const preset = presets.find((p) => p.id === st.c) ?? null;
  const found = useMemo(() => (preset ? periodFor(preset.periods, st.j, euMember) : null), [preset, st.j, euMember]);
  const jurisdiction = jurisdictions.find((j) => j.iso3 === st.j);
  // inside a sentence: "Published target dates for the European Union"
  const jurisdictionName = st.j === 'EUU' ? copy.whereEuName : jurisdiction?.name ?? '';
  // where the Atlas does hold a period for this kind of data, for the note that says it holds none here
  const elsewhere = useMemo(() => {
    if (!preset || found) return NO_ROOM;
    const name = (iso3: string) => (iso3 === 'EUU' ? copy.whereEuName : jurisdictions.find((j) => j.iso3 === iso3)?.inSentence ?? null);
    return placesWithPeriod(preset.periods, st.j, name, euMember, copy.shelfEuMembers);
  }, [preset, found, st.j, jurisdictions, euMember, copy]);
  // the place inside the note's sentence: "the United States", "the European Union"
  const placeInSentence = st.j === 'EUU' ? copy.whereEuName : jurisdiction?.inSentence ?? '';
  const lineDeadlines = deadlines[st.j] ?? deadlines.none ?? [];
  // the place's own dates and the standards bodies' dates, kept apart as the chart's two lanes are
  const ownLines = useMemo(() => lineDeadlines.filter((d) => d.lane !== 'standards'), [lineDeadlines]);
  const standardLines = useMemo(() => lineDeadlines.filter((d) => d.lane === 'standards'), [lineDeadlines]);
  const posture = jurisdictionName ? postures[st.j] ?? null : null;
  // presentation mode draws a wide chart at a narrower width, so the browser scales its type up
  const chartWidth = st.present && width >= 760 ? Math.round(width / PRESENT_SCALE) : width;

  const set = useCallback((patch: Partial<ClockState>) => setSt((s) => ({ ...s, ...patch })), []);
  // the layout changes size between modes, so it switches without gliding; the control that
  // closed it leaves the page with it, so focus moves to the first control of the form
  const leavePresentation = () => {
    setAnimated(false);
    set({ present: false });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAnimated(true), 400);
    window.requestAnimationFrame(() => firstControl.current?.focus());
  };
  // the links under the target dates, built at build time: none for "No country chosen"
  const compareHref = jurisdictionName && ownLines.length ? links.compare[st.j] ?? null : null;
  const profileLink = jurisdictionName ? links.profile[st.j] ?? null : null;
  // what sets a date, in the words of the Target dates view, where the Atlas has recorded it
  const basisText = useCallback((d: ClockDeadline) => (d.basis === 'law' ? copy.basisLaw : d.basis === 'guidance' ? copy.basisGuidance : copy.basisNone), [copy]);
  // the same words with the lead mark, as the table and the CSV give them
  const basisCell = useCallback((d: ClockDeadline) => `${basisText(d)}${d.basisLead ? ` (${copy.notVerified})` : ''}`, [basisText, copy]);
  // choosing what you protect, or where, sets the shelf life from a sourced period when one
  // exists, and gives back the visitor's own value when the sourced period stops applying
  const choose = useCallback(
    (patch: Partial<ClockState>) => {
      setUseShown(false);
      setSt((s) => {
        const next = { ...s, ...patch };
        return { ...next, x: shelfLifeAfterChoice({ x: s.x, before: sourcedYears(s.c, s.j), after: sourcedYears(next.c, next.j), userX: userX.current }) };
      });
    },
    [sourcedYears],
  );

  const yearsUnit = useCallback((n: number) => `${n} ${n === 1 ? copy.yearUnit : copy.yearsUnit}`, [copy]);
  const onShelf = useCallback(
    (n: number) => {
      userX.current = n;
      set({ x: n });
    },
    [set],
  );
  const onMigration = useCallback((n: number) => set({ y: n }), [set]);
  const onStart = useCallback((n: number) => set({ s: n === year ? null : n }), [set, year]);

  // a screen reader hears the new readout once the values settle, not at every step of a drag;
  // the readout the page opens with is not read out
  const said = sentences.join(' ');
  useEffect(() => {
    if (!ready) return;
    if (firstSpoken.current === null) {
      firstSpoken.current = said;
      return;
    }
    const id = window.setTimeout(() => setSpoken(said), SPEAK_PAUSE_MS);
    return () => window.clearTimeout(id);
  }, [said, ready]);

  const sourcedYearsNow = startingYears(found?.period ?? null);
  const sourcedFit = sourcedYearsNow === null ? null : fitX(sourcedYearsNow);
  if (sourcedFit !== null && sourcedFit !== st.x && !useShown) setUseShown(true);
  // "Use N years" sets the slider to the sourced period, and focus goes back to the slider
  const applySourced = useCallback(
    (years: number) => {
      set({ x: years });
      firstControl.current?.focus();
    },
    [set],
  );
  const shelfNote = (
    <ShelfNote
      copy={copy}
      preset={preset}
      found={found}
      place={st.j}
      placeName={placeInSentence}
      elsewhere={elsewhere}
      x={st.x}
      useShown={useShown}
      showWords={showWords}
      onUse={applySourced}
    />
  );

  const descId = `${uid}-cdesc`;
  const view = st.view;

  // what and where: drawn again only when a choice changes, never while a slider moves
  const whereWhat = useMemo(() => {
    const shown = view === 'public-admin' ? presets.filter((p) => p.publicAdmin) : presets;
    const groups = [...new Set(jurisdictions.map((j) => j.group))];
    return (
      <>
        <div className="xc-field">
          <label htmlFor={`${uid}-j`}>{copy.whereLabel}</label>
          <select id={`${uid}-j`} className="lab-select" value={st.j} onChange={(e) => choose({ j: e.target.value })}>
            <option value="none">{copy.whereNone}</option>
            <option value="EUU">{copy.whereEu}</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {jurisdictions.filter((j) => j.group === g).map((j) => (
                  <option key={j.iso3} value={j.iso3}>{j.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <fieldset className="xc-field" aria-describedby={preset?.description ? descId : undefined}>
          <legend>{copy.protectLegend}</legend>
          <div className="lab-choice xc-choices">
            {[...shown, { id: 'other', label: copy.protectOther }].map((p) => (
              <label key={p.id}>
                <input type="radio" name={`${uid}-c`} value={p.id} checked={st.c === p.id} onChange={() => choose({ c: p.id })} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
          {preset?.description && <p id={descId} className="xc-note">{preset.description}</p>}
        </fieldset>
      </>
    );
  }, [view, presets, jurisdictions, uid, copy, st.j, st.c, choose, preset, descId]);

  // the profile's name for a restated line: "The Belgium profile records this target as ..."
  const countryName = profileLink?.name ?? jurisdiction?.name ?? '';

  // the place's dates: drawn again when the place, the year or the ringed row changes
  const dates = useMemo(() => {
    // one row of a list, laid out as the profile timeline's: key dot, the year in its own mono
    // column, then the line with a short link to its source (the issuer, or the profile for a
    // profile line, which records no issuer); the full title stays in the table and the sources
    const dateRow = (d: ClockDeadline) => (
      <li
        key={d.id}
        className={`${focused.includes(d.id) ? 'is-active' : ''}${d.year < year ? ' is-past' : ''}`.trim() || undefined}
        onPointerEnter={() => setFocused([d.id])}
        onPointerLeave={() => setFocused([])}
        // the keyboard path: a row's link taking focus rings its mark in the chart
        onFocus={() => setFocused([d.id])}
        onBlur={() => setFocused([])}
      >
        <svg className="xc-key" viewBox="-5 -5 10 10" aria-hidden="true">
          <DeadlineMark d={d} />
        </svg>
        <span className="xc-row-year mono">{d.display}</span>
        <div>
          <p>
            {d.label.replace(/\.$/, '')}.{' '}
            {d.sourceUrl ? <a href={d.sourceUrl} rel="noopener">{d.issuer ?? d.sourceLabel}</a> : d.issuer ?? d.sourceLabel}
            {!d.verified && <span className="xc-flag"> {copy.notVerified}</span>}
          </p>
          {d.restated && (
            <p className="xc-sub">
              {fill(d.restated.lead ? copy.restatedNoteLead : copy.restatedNote, { country: countryName, label: d.restated.label })}
            </p>
          )}
          <p className="xc-basis">
            {basisText(d)}
            {d.basisLead && <span className="xc-flag"> {copy.notVerified}</span>}
          </p>
          {d.year < year && <p className="xc-sub">{copy.pastNote}</p>}
        </div>
      </li>
    );
    // each kind of document is explained once, above its group, not under every row
    const hasRoadmap = ownLines.some((d) => d.lane === 'roadmap' || /EU coordinated roadmap/i.test(d.label));
    return (
      <section className="xc-dates" aria-labelledby={`${uid}-dl`}>
        <div className="xc-dates-head">
          <h2 id={`${uid}-dl`} className="section-h">
            {jurisdictionName ? fill(copy.targetsHeading, { place: jurisdictionName }) : copy.targetsHeadingNone}
          </h2>
          {posture && (
            <span className="lab-chip" title={posture.label}>
              <span className="d" style={{ background: posture.color }} aria-hidden="true" />
              {posture.short}
            </span>
          )}
        </div>
        {!jurisdictionName && <p className="xc-note">{copy.targetsChoose}</p>}
        {jurisdictionName && ownLines.length === 0 && <p className="xc-note">{fill(copy.targetsEmpty, { place: jurisdictionName })}</p>}
        {ownLines.length > 0 && (
          <>
            <div className="xc-kinds">
              <p className="xc-note">{copy.targetsIntro}</p>
              {hasRoadmap && <p className="xc-note">{copy.roadmapNote}</p>}
            </div>
            <ul className="xc-date-list">{ownLines.map(dateRow)}</ul>
          </>
        )}
        {(compareHref || profileLink) && (
          <ul className="xc-links">
            {compareHref && (
              <li>
                <a href={compareHref}>
                  {copy.compareLink}&nbsp;<span aria-hidden="true">→</span>
                </a>
              </li>
            )}
            {profileLink && (
              <li>
                <a href={profileLink.href}>
                  {fill(copy.profileLink, { country: profileLink.name })}&nbsp;<span aria-hidden="true">→</span>
                </a>
              </li>
            )}
          </ul>
        )}
        {standardLines.length > 0 && (
          <div className="xc-group" role="group" aria-labelledby={`${uid}-std`}>
            <h3 id={`${uid}-std`} className="xc-group-head">{copy.laneStandards}</h3>
            <p className="xc-note">{copy.standardsNote}</p>
            <ul className="xc-date-list">{standardLines.map(dateRow)}</ul>
          </div>
        )}
      </section>
    );
  }, [focused, year, copy, countryName, basisText, ownLines, standardLines, uid, jurisdictionName, posture, compareHref, profileLink]);

  // the tables of the place's dates, and the survey's: none of them changes while a slider moves
  const dateTables = useMemo(() => {
    // the table of one group of dates; under 640px its rows stack, each cell named by its column
    const datesTable = (caption: string, rows: ClockDeadline[]) => (
      <table className="is-stack">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="num">{copy.colYear}</th>
            <th scope="col">{copy.colWhat}</th>
            <th scope="col">{copy.colSource}</th>
            <th scope="col">{copy.colBasis}</th>
            <th scope="col">{copy.colStatus}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <th scope="row" className="num mono">{d.display}</th>
              <td data-label={copy.colWhat}>{d.label}</td>
              <td data-label={copy.colSource}>
                {d.issuer ? `${d.issuer}: ` : ''}
                {d.sourceUrl ? <a href={d.sourceUrl} rel="noopener">{d.sourceLabel}</a> : d.sourceLabel}
              </td>
              <td data-label={copy.colBasis}>{basisCell(d)}</td>
              <td data-label={copy.colStatus}>{d.verified ? copy.checkedYes : copy.checkedNo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
    return (
      <>
        {ownLines.length > 0 && datesTable(fill(copy.targetsHeading, { place: jurisdictionName }), ownLines)}
        {standardLines.length > 0 && datesTable(copy.laneStandards, standardLines)}
      </>
    );
  }, [copy, basisCell, ownLines, standardLines, jurisdictionName]);

  const surveyTable = useMemo(
    () =>
      surveyRows.length > 0 && (
        <table>
          <caption>{fill(copy.tableSurveyCaption, { surveyTitle: survey?.title ?? '' })}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.colHorizon}</th>
              <th scope="col" className="num">{copy.colYear}</th>
              <th scope="col" className="num">{copy.colLower}</th>
              <th scope="col" className="num">{copy.colUpper}</th>
              <th scope="col">{copy.colPage}</th>
            </tr>
          </thead>
          <tbody>
            {surveyRows.map((r) => (
              <tr key={r.horizonYears}>
                <th scope="row">{yearsUnit(r.horizonYears)}</th>
                <td className="num mono">{r.year}</td>
                <td className="num mono">{Math.round(r.lower * 100)}%</td>
                <td className="num mono">{Math.round(r.upper * 100)}%</td>
                <td>{r.page}{r.verified ? '' : ` (${copy.notVerified})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    [surveyRows, copy, survey, yearsUnit],
  );

  // the share image names each year still ahead once
  const shareLines = useMemo(() => {
    const yearsAhead = [...new Set(ownLines.filter((d) => d.year >= year).map((d) => d.year))].sort((a, b) => a - b);
    return [
      `${sentences[0]} ${sentences[1]}`,
      sentences[2],
      jurisdictionName && ownLines.length ? `${fill(copy.targetsHeading, { place: jurisdictionName })}: ${yearsAhead.join(', ') || copy.shareNoneAhead}.` : '',
    ].filter(Boolean);
  }, [sentences, ownLines, year, jurisdictionName, copy]);

  // the dates as a CSV: the same columns as the table, plus the group each row is listed under;
  // a profile link is given in full, so it still works in a downloaded file
  const csv = useMemo(() => {
    const absolute = (url: string) => (url.startsWith('/') ? `${origin}${url}` : url);
    const laneName = (d: ClockDeadline) => (d.lane === 'standards' ? copy.laneStandards : copy.laneTargets);
    const rows = [...ownLines, ...standardLines].map((d) => [
      d.display,
      laneName(d),
      d.label,
      d.issuer ?? '',
      d.sourceLabel,
      basisCell(d),
      d.verified ? copy.checkedYes : copy.checkedNo,
      absolute(d.sourceUrl),
    ]);
    return rows.length
      ? { filename: copy.csvFilename, header: [copy.colYear, copy.colLane, copy.colWhat, copy.colIssuer, copy.colSource, copy.colBasis, copy.colStatus, 'URL'], rows }
      : null;
  }, [ownLines, standardLines, origin, copy, basisCell]);

  const chartProps = {
    result,
    survey,
    deadlines: lineDeadlines,
    copy,
    checking: !!survey && !survey.verified,
    onFocusDeadlines: setFocused,
    focusedDeadlines: focused,
  };

  return (
    <div className={`xc${st.present ? ' xc--present' : ''}`} data-live={ready ? '' : undefined}>
      {st.present && (
        <p className="xc-present-bar">
          <button type="button" className="xc-textlink" onClick={leavePresentation}>
            {copy.presentExit}
          </button>
          <span className="xc-present-hint">{copy.presentHint}</span>
        </p>
      )}
      {/* one form, "Your situation": the two questions of the page's title and the start beside the
          chart, then where and what. From 900px the sliders and then where and what fill the left
          column beside the chart; narrower, the chart and its readout follow the sliders, so the
          view each slider moves is right under it, and where and what come after the answer */}
      <form className="xc-layout" aria-labelledby={`${uid}-head`} onSubmit={(e) => e.preventDefault()}>
        <p id={`${uid}-head`} className="sr-only">{copy.controlsLegend}</p>
        <div className="xc-controls lab-group">
          {st.view === 'public-admin' && <p className="xc-context">{copy.publicAdminContext}</p>}

          <Slider
            id={`${uid}-x`}
            label={copy.shelfLabel}
            value={st.x}
            min={LIMITS.x[0]}
            max={LIMITS.x[1]}
            unit={yearsUnit}
            onChange={onShelf}
            note={shelfNote}
            inputRef={firstControl}
          />
          <Slider id={`${uid}-y`} label={copy.migrationLabel} value={st.y} min={LIMITS.y[0]} max={LIMITS.y[1]} unit={yearsUnit} onChange={onMigration} />

          <details className="xc-advanced lab-disclose" ref={advancedRef}>
            <summary>{copy.startSummary}</summary>
            <Slider id={`${uid}-s`} label={copy.startLabel} value={st.s ?? year} min={year} max={year + START_SPAN} unit={plainYear} onChange={onStart} />
          </details>
        </div>

        <div className="xc-main">
          <figure className={`xc-figure${measured ? ' is-measured' : ''}`} ref={chartRef}>
            <ChartBoundary fallback={<p className="xc-error">{copy.chartError}</p>}>
              {measured ? (
                <ExposureChart width={chartWidth} animate={animated && !reduced} {...chartProps} />
              ) : (
                FIRST_WIDTHS.map((w) => (
                  <div key={w} className={`xc-first xc-first--${w}`}>
                    <ExposureChart width={w} fit {...chartProps} />
                  </div>
                ))
              )}
            </ChartBoundary>
            {surveyStale && <figcaption className="xc-note">{copy.surveyStale}</figcaption>}
          </figure>

          <Readout sentences={sentences} room={room} keep={keepTitles} standing={copy.standing} />
          <p className="sr-only" aria-live="polite">{spoken}</p>
        </div>

        <div className="xc-where lab-group">{whereWhat}</div>
      </form>

      {dates}

      <ShareBar
        svgSelector=".xc-figure svg"
        title={copy.title}
        lines={shareLines}
        sourceLine={fill(copy.shareSource, { surveyTitle: survey?.title ?? 'expert survey' })}
        asOf={asOfLabel}
        filename="exposure-clock.png"
        csv={csv}
      />

      <details className="lab-table" ref={tableRef}>
        <summary>{copy.tableSummary}</summary>
        {surveyTable}
        <table>
          <caption>{copy.tableHorizonsCaption}</caption>
          <tbody>
            <tr><th scope="row">{copy.rowMigration}</th><td className="num mono">{result.migrationEnds}</td></tr>
            <tr><th scope="row">{copy.rowToday}</th><td className="num mono">{result.secrecyUntilForToday}</td></tr>
            <tr><th scope="row">{copy.rowLast}</th><td className="num mono">{result.secrecyUntilForLast}</td></tr>
          </tbody>
        </table>
        {dateTables}
      </details>
    </div>
  );
}
