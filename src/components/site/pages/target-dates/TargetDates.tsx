// Target dates (spec 6.3): the island. "Where you operate" (one search field, the places chosen
// shown as small removable chips under it), the one readout sentence, the view (one band per place
// on the fixed 2025 to 2036 axis from 640px; a list grouped by year below it), its key, the kind
// and lane filters folded behind one quiet "Choose what to show", "Show as a table", the quiet
// actions and "Where to go next", whose last row is "Also used in Prepare" (the épuré pass: the
// line no longer stands beside the view switch, which the frame now draws under the H1).
// Whitespace separates them; no rule is drawn between them.
//
// The search is an ARIA combobox over the places with recorded dates: typing lists the closest
// matches (eight at most), the up and down arrow keys move through them, Enter adds or removes the
// one in focus, Escape closes the list and then clears the field. A status line tells a screen
// reader how many places match and what was added or removed. There is no list of every place:
// Swann asked for the search alone (2 October 2026).
//
// Marks: the shape gives the kind of date; solid is the place's own record, open is a record that
// reaches it through EU membership ("Addressed to Member States"), dotted ink-faint is a lead
// (preview builds only). Colour appears only as the posture dot beside a place name, always with
// the posture's short label from POSTURE_META. Every href arrives as a prop, computed at build
// time; the island holds no route of its own. The state is kept in the address (?in=, and ?kind=
// and ?lane= when narrowed), so Copy link reopens the view as it is.
//
// The server renders it with no place chosen, so the page reads without JavaScript: the head and
// the full table, grouped by country. Every control is marked js-only and shows once scripts run.
// Nothing moves unless the visitor acts.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ShareBar from '../../../lab/ShareBar';
import { REVIEW_PARAM, reviewRequested } from '../../../../lib/site/review';
import { Glyph, PlaceName, Shape, TdTable, markOf } from './parts';
import {
  AXIS_END,
  AXIS_START,
  KIND_KEYS,
  LANES,
  byName,
  csvTable,
  dateText,
  fill,
  groupByYear,
  joinAnd,
  kindKey,
  laneOf,
  lawNote,
  markText,
  matchPlaces,
  narrowing,
  nextLinks,
  noKinds,
  noLanes,
  readState,
  readout,
  rowMeta,
  sentenceCase,
  unpackRows,
  visibleRows,
  writeState,
  yearListMeta,
} from './model';
import type { KindKey, Lane, PackedRows, TdCopy, TdLinks, TdPlace, TdRow, TdState } from './model';

type Withheld = { iso3: string; name: string; aliases: string[] };

interface Props {
  prepare?: string | null; // the Prepare hub, when built: the last row of Where to go next
  packed: PackedRows; // the rows, packed (model.ts); unpacked identically on the server and in the browser
  audiences: Record<string, string>;
  places: TdPlace[];
  withheld?: Withheld[]; // places this build leaves out until re-read (dates.ts, REREAD)
  links: TdLinks;
  copy: TdCopy;
  hasLeads: boolean;
  asOfLabel: string;
}

// the address is read before the first paint once the page is live (on the server, a plain effect)
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// ---- the chart ----------------------------------------------------------------------------------

interface Tip {
  row: TdRow;
  x: number;
  y: number;
}

const YEARS = Array.from({ length: AXIS_END - AXIS_START + 1 }, (_, i) => AXIS_START + i);

/**
 * Spread marks that share a lane and a column so none hides another: each keeps its place where it
 * can, at least `step` apart, all between lo and hi (the step shrinks when the column is crowded).
 */
function spread(xs: number[], lo: number, hi: number, step: number): number[] {
  const n = xs.length;
  if (n < 2) return xs.map((x) => Math.min(Math.max(x, lo), hi));
  const s = Math.min(step, (hi - lo) / (n - 1));
  const out = xs.map((x) => Math.min(Math.max(x, lo), hi));
  for (let i = 1; i < n; i++) out[i] = Math.max(out[i], out[i - 1] + s);
  if (out[n - 1] > hi) {
    out[n - 1] = hi;
    for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - s);
  }
  return out;
}

function Chart({ rows, chosen, copy, width, onTip }: { rows: TdRow[]; chosen: TdPlace[]; copy: TdCopy; width: number; onTip: (t: Tip | null) => void }) {
  // the keyboard route: one tab stop on the marks, the arrow keys move between them in the order
  // they are drawn (place by place), and the mark in focus shows its tooltip, as a pointer does
  const [active, setActive] = useState(0);
  const refs = useRef<(SVGGElement | null)[]>([]);
  let count = 0;
  const total = chosen.reduce((n, p) => n + rows.filter((r) => r.iso3 === p.iso3).length, 0);
  const move = (to: number) => {
    const n = refs.current.filter(Boolean).length;
    if (!n) return;
    const next = (to + n) % n;
    setActive(next);
    refs.current[next]?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(i + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      move(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(refs.current.filter(Boolean).length - 1);
    } else if (e.key === 'Escape') onTip(null);
  };
  const gutter = width < 760 ? 108 : 132;
  const early = rows.some((r) => r.year < AXIS_START);
  const late = rows.some((r) => r.year > AXIS_END);
  const sideW = 52;
  const sideGap = 10;
  const x0 = gutter + (early ? sideW + sideGap : 0);
  const x1 = width - (late ? sideW + sideGap : 0);
  const colW = (x1 - x0) / YEARS.length;
  const AXIS_H = 50;
  const RULE_Y = AXIS_H - 8;
  const NAME_H = 30;
  const LANE_H = 24;
  const GAP = 22; // whitespace between places: no rule is drawn between them
  const bandH = NAME_H + LANE_H * LANES.length + GAP;
  const height = AXIS_H + chosen.length * bandH;
  const everyOther = colW < 38;
  const R = 7; // half the width of a mark, with a pixel of air

  // A date is placed at its month where the source names one, and in the middle of its year where it
  // gives the year only; always inside its own year's column, so a December date never reads as
  // the next year. Dates outside the axis go in the Earlier and Later columns.
  const slot = (year: number): { lo: number; hi: number } => {
    if (year < AXIS_START) return { lo: gutter + R, hi: gutter + sideW - R };
    if (year > AXIS_END) return { lo: x1 + sideGap + R, hi: width - R };
    const left = x0 + (year - AXIS_START) * colW;
    return { lo: left + R + 1, hi: left + colW - R - 1 };
  };
  const baseX = (r: TdRow): number => {
    const { lo, hi } = slot(r.year);
    if (r.year < AXIS_START || r.year > AXIS_END || !r.month) return (lo + hi) / 2;
    const left = x0 + (r.year - AXIS_START) * colW;
    return Math.min(Math.max(left + ((r.month - 0.5) / 12) * colW, lo), hi);
  };

  // today, as a tick on the axis only: a dated mark is never drawn across a line it might seem to have passed
  const now = new Date();
  const todayX =
    now.getFullYear() >= AXIS_START && now.getFullYear() <= AXIS_END
      ? x0 + (now.getFullYear() - AXIS_START + (now.getMonth() + (now.getDate() - 1) / 31) / 12) * colW
      : null;

  const label = fill(copy.chartLabel, { places: joinAnd(chosen.map((p) => p.inSentence)), start: AXIS_START, end: AXIS_END, n: rows.length });

  return (
    <svg className="td-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${label} ${copy.chartKeys}`}>
      {/* the axis: year labels over a 1px ink rule with a short tick at each year's edge, the
          Earlier and Later columns named as such. No gridlines run down the bands: the lane
          rules carry the eye across, and the axis gives the year */}
      <g className="td-axis" aria-hidden="true">
        {YEARS.map((y, i) =>
          everyOther && i % 2 === 1 ? null : (
            <text key={y} x={x0 + (i + 0.5) * colW} y={18} textAnchor="middle" className="td-year">
              {y}
            </text>
          ),
        )}
        {early && (
          <>
            <text x={gutter + sideW / 2} y={18} textAnchor="middle" className="td-year td-year--side">
              {copy.earlier}
            </text>
            <line x1={gutter} x2={gutter + sideW} y1={RULE_Y} y2={RULE_Y} className="td-rule" />
          </>
        )}
        <line x1={x0} x2={x1} y1={RULE_Y} y2={RULE_Y} className="td-rule" />
        {YEARS.concat(AXIS_END + 1).map((y, i) => (
          <line key={`t${y}`} x1={x0 + i * colW} x2={x0 + i * colW} y1={RULE_Y} y2={RULE_Y + 5} className="td-rule-tick" />
        ))}
        {late && (
          <>
            <text x={x1 + sideGap + sideW / 2} y={18} textAnchor="middle" className="td-year td-year--side">
              {copy.later}
            </text>
            <line x1={x1 + sideGap} x2={width} y1={RULE_Y} y2={RULE_Y} className="td-rule" />
          </>
        )}
        {todayX !== null && (
          <g className="td-today">
            <line x1={todayX} x2={todayX} y1={RULE_Y - 13} y2={RULE_Y + 5} />
            <text x={todayX + 4} y={RULE_Y - 5}>
              {copy.today}
            </text>
          </g>
        )}
      </g>

      {chosen.map((place, pi) => {
        const top = AXIS_H + pi * bandH;
        const laneTop = top + NAME_H;
        const mine = rows.filter((r) => r.iso3 === place.iso3);
        // marks that share a lane and a column are spread so none hides another
        const cells = new Map<string, TdRow[]>();
        for (const r of mine) {
          const k = `${laneOf(r)}|${r.year < AXIS_START ? 'e' : r.year > AXIS_END ? 'l' : r.year}`;
          cells.set(k, [...(cells.get(k) ?? []), r]);
        }
        return (
          <g key={place.iso3} className="td-band">
            <g aria-hidden="true">
              {place.posture ? (
                <circle cx={6} cy={top + 17} r={4.5} fill={place.posture.color} />
              ) : (
                <circle cx={6} cy={top + 17} r={4} className="td-dotsvg--none" />
              )}
              <text x={18} y={top + 21.5} className="td-bname">
                {place.name}
                <tspan dx={8} className="td-bpost">
                  {place.posture?.short ?? copy.placesNoPosture}
                </tspan>
              </text>
            </g>
            {LANES.map((lane, li) => {
              const cy = laneTop + li * LANE_H + LANE_H / 2;
              return (
                <g key={lane} aria-hidden="true">
                  <text x={gutter - 12} y={cy + 4} textAnchor="end" className="td-lane">
                    {copy.laneShort[lane]}
                  </text>
                  {early && <line x1={gutter} x2={gutter + sideW} y1={cy} y2={cy} className="td-laneline" />}
                  <line x1={x0} x2={x1} y1={cy} y2={cy} className="td-laneline" />
                  {late && <line x1={x1 + sideGap} x2={width} y1={cy} y2={cy} className="td-laneline" />}
                </g>
              );
            })}
            {[...cells.entries()].flatMap(([k, cell]) => {
              const lane = k.split('|')[0] as Lane;
              const cy = laneTop + LANES.indexOf(lane) * LANE_H + LANE_H / 2;
              const sorted = [...cell].sort((a, b) => baseX(a) - baseX(b) || (a.month ?? 13) - (b.month ?? 13));
              const { lo, hi } = slot(sorted[0].year);
              const xs = spread(
                sorted.map((r) => baseX(r)),
                lo,
                hi,
                14,
              );
              return sorted.map((r, i) => {
                const cx = xs[i];
                const at = count++;
                return (
                  <g
                    key={r.key}
                    className="td-mk"
                    ref={(el) => {
                      refs.current[at] = el;
                    }}
                    role="img"
                    aria-label={markText(r, copy)}
                    tabIndex={at === Math.min(active, total - 1) ? 0 : -1}
                    onFocus={() => {
                      setActive(at);
                      onTip({ row: r, x: cx, y: cy });
                    }}
                    onBlur={() => onTip(null)}
                    onKeyDown={(e) => onKey(e, at)}
                    onPointerEnter={() => onTip({ row: r, x: cx, y: cy })}
                    onPointerLeave={() => onTip(null)}
                    onClick={() => onTip({ row: r, x: cx, y: cy })}
                  >
                    <circle cx={cx} cy={cy} r={11} className="td-hit" />
                    <Shape kind={kindKey(r.kind)} mark={markOf(r)} cx={cx} cy={cy} />
                  </g>
                );
              });
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ---- where you operate: the search and the chosen places ------------------------------------------

/** The most places the search lists at once; past it, a line asks the visitor to keep typing. */
const CAP = 8;

interface PickerProps {
  places: TdPlace[];
  withheld: Withheld[];
  chosen: TdPlace[];
  copy: TdCopy;
  onToggle: (iso3: string) => void;
  onClear: () => void;
}

function Picker({ places, withheld, chosen, copy, onToggle, onClear }: PickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const chips = useRef(new Map<string, HTMLButtonElement>());
  const focusNext = useRef<string | null | undefined>(undefined); // after a chip goes: the chip to focus, or null for the field

  const q = query.trim();
  const all = useMemo(() => (q ? matchPlaces(places, q) : byName(places)), [places, q]);
  const items = all.slice(0, CAP);
  const isOn = new Set(chosen.map((p) => p.iso3));
  const held = q && !all.length ? (matchPlaces(withheld, q)[0] ?? null) : null;
  const empty = held ? fill(copy.placesWithheld, { place: held.name }) : copy.placesNoMatch;
  const more = all.length > items.length ? fill(copy.pickMore, { shown: items.length, n: all.length }) : '';
  const expanded = open && items.length > 0;

  // what a screen reader hears while the list is open: how many places match, or why none does
  useEffect(() => {
    if (!open) return;
    setStatus(!all.length ? empty : more || fill(all.length === 1 ? copy.pickMatchOne : copy.pickMatchMany, { n: all.length }));
    // only when the query or the list's state changes, never on a re-render alone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  // once a chip is removed, the keyboard moves to the chip that took its place, or to the field
  useEffect(() => {
    const iso = focusNext.current;
    if (iso === undefined) return;
    focusNext.current = undefined;
    const el = iso ? chips.current.get(iso) : null;
    (el ?? input.current)?.focus();
  }, [chosen]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const choose = (p: TdPlace) => {
    setStatus(fill(isOn.has(p.iso3) ? copy.pickRemoved : copy.pickAdded, { place: p.name }));
    onToggle(p.iso3);
    setQuery('');
    close();
    input.current?.focus();
  };
  const remove = (p: TdPlace, i: number) => {
    focusNext.current = (chosen[i + 1] ?? chosen[i - 1])?.iso3 ?? null;
    setStatus(fill(copy.pickRemoved, { place: p.name }));
    onToggle(p.iso3);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const down = e.key === 'ArrowDown';
      if (!open) {
        setOpen(true);
        setActive(items.length ? (down ? 0 : items.length - 1) : -1);
        return;
      }
      if (!items.length) return;
      const n = items.length;
      setActive((a) => (a < 0 ? (down ? 0 : n - 1) : (a + (down ? 1 : -1) + n) % n));
    } else if (e.key === 'Enter') {
      if (!open) {
        if (q) {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }
      e.preventDefault();
      // the place in focus; with none in focus, the closest match not yet chosen (Enter never removes it)
      const p = active >= 0 ? items[active] : items.find((x) => !isOn.has(x.iso3));
      if (p) choose(p);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        close();
      } else if (query) {
        e.preventDefault();
        setQuery('');
        setStatus('');
      }
    } else if (e.key === 'Tab') close();
  };

  return (
    <>
      <div className="td-combo">
        <svg className="td-combo-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="6.5" cy="6.5" r="4.75" />
          <path d="M10 10l4.25 4.25" />
        </svg>
        <input
          ref={input}
          id="td-q"
          className="td-search"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls="td-list"
          aria-activedescendant={expanded && active >= 0 && items[active] ? `td-opt-${items[active].iso3}` : undefined}
          value={query}
          placeholder={copy.placesPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(e) => {
            const v = e.currentTarget.value;
            setQuery(v);
            setOpen(v.trim() !== '');
            setActive(-1);
          }}
          onClick={() => {
            if (q) setOpen(true);
          }}
          onKeyDown={onKey}
          onBlur={close}
        />
        {/* the list keeps the focus in the field: a press on an option chooses it without a blur */}
        <div className="td-pop" hidden={!open} onMouseDown={(e) => e.preventDefault()}>
          <ul id="td-list" className="td-options" role="listbox" aria-multiselectable="true" aria-label={copy.pickListLabel}>
            {open &&
              items.map((p, i) => (
                <li
                  key={p.iso3}
                  id={`td-opt-${p.iso3}`}
                  role="option"
                  aria-selected={isOn.has(p.iso3)}
                  className={`td-option${i === active ? ' is-active' : ''}${isOn.has(p.iso3) ? ' is-on' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p)}
                >
                  <span className="td-box" aria-hidden="true" />
                  <PlaceName place={p} copy={copy} />
                </li>
              ))}
          </ul>
          {open && (!items.length || more) && <p className="td-pop-msg">{items.length ? more : empty}</p>}
        </div>
      </div>

      {chosen.length > 0 && (
        <div className="td-picked">
          <ul className="td-chips-on" aria-label={copy.pickChosenLabel}>
            {chosen.map((p, i) => (
              <li key={p.iso3} className="td-chip">
                <span className="td-chip-n">{p.name}</span>
                <button
                  type="button"
                  className="td-chip-x"
                  aria-label={fill(copy.pickRemove, { place: p.name })}
                  ref={(el) => {
                    if (el) chips.current.set(p.iso3, el);
                    else chips.current.delete(p.iso3);
                  }}
                  onClick={() => remove(p, i)}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                    <path d="M3 3 L9 9 M9 3 L3 9" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          {chosen.length > 1 && (
            <button
              type="button"
              className="td-textbtn"
              onClick={() => {
                focusNext.current = null;
                setStatus(copy.pickCleared);
                onClear();
              }}
            >
              {copy.clear}
            </button>
          )}
        </div>
      )}
      <p className="fr-sr" role="status" aria-live="polite">
        {status}
      </p>
    </>
  );
}

// ---- the island ---------------------------------------------------------------------------------

const EMPTY: TdState = { places: [], kinds: noKinds(), lanes: noLanes() };

/** "Show as a table" opens by default where the table is the view: from 640px with no place chosen, and on phones once one is. */
const tableByDefault = (chosen: boolean, wide: boolean) => (chosen ? !wide : wide);
const isWide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches;

export default function TargetDates({ prepare = null, packed, audiences, places, withheld = [], links, copy, hasLeads, asOfLabel }: Props) {
  const rows = useMemo(() => unpackRows(packed, places), [packed, places]);
  // the server renders the empty state; the address is read once the page is live
  const [state, setState] = useState<TdState>(EMPTY);
  const [ready, setReady] = useState(false);
  // "Show as a table": open on the server, so the page reads without JavaScript
  const [tableOpen, setTableOpen] = useState(true);
  const touched = useRef(false); // the visitor opened or closed the table: their choice then stands
  const [folded, setFolded] = useState(true); // "Choose what to show": folded unless a link opens on a narrowed view
  const [width, setWidth] = useState(800);
  const [tip, setTip] = useState<Tip | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDetailsElement>(null);

  const byCode = useMemo(() => new Map(places.map((p) => [p.iso3, p])), [places]);

  // read the address before the first live paint, so a shared link opens on its own view
  useIsoLayoutEffect(() => {
    const s = readState(window.location.search, places);
    setState(s);
    setTableOpen(tableByDefault(s.places.length > 0, isWide()));
    setFolded(narrowing(s) === 0);
    setReady(true);
  }, [places]);

  // keep the address in step, so Copy link reopens this view (a review link, ?review=1, stays one)
  useEffect(() => {
    if (!ready) return;
    const view = writeState(state);
    const search = reviewRequested() ? `${view ? `${view}&` : '?'}${REVIEW_PARAM}=1` : view;
    const next = `${window.location.pathname}${search}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', next);
  }, [state, ready]);

  // the table follows the view's default (open where it is the view) until the visitor sets it
  const anyChosen = state.places.length > 0;
  useEffect(() => {
    if (!ready || touched.current) return;
    setTableOpen(tableByDefault(anyChosen, isWide()));
  }, [anyChosen, ready]);

  // the chart's width follows its column
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // printing shows the table, then puts it back as the visitor left it
  useEffect(() => {
    let was = true;
    const before = () => {
      was = table.current?.open ?? true;
      if (table.current) table.current.open = true;
    };
    const after = () => {
      if (table.current) table.current.open = was;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  const chosen = state.places.map((c) => byCode.get(c)).filter((p): p is TdPlace => Boolean(p));
  const shown = visibleRows(rows, state);
  const sentence = readout(rows, state, places, copy);
  const law = lawNote(rows, state, copy);
  // Where to go next: the view's own links, then the Prepare hub ("Also used in Prepare"), the one
  // row that leaves the Countries section
  const next = [...nextLinks(state, places, links, copy), ...(prepare ? [{ label: copy.alsoPrepare, href: prepare }] : [])];
  const csv = csvTable(shown, places, copy, audiences);
  // the key names only the shapes the view draws, in the kinds' own order
  const drawnKinds = KIND_KEYS.filter((k) => shown.some((r) => kindKey(r.kind) === k));
  // the list by year (phones): a muted line every target shares is said once above the list
  const years = groupByYear(shown);
  const yearMeta = yearListMeta(years, copy);

  const setPlaces = (codes: string[]) =>
    setState((s) => ({ ...s, places: byName(codes.map((c) => byCode.get(c)!).filter(Boolean)).map((p) => p.iso3) }));
  const togglePlace = (iso3: string) =>
    setState((s) => {
      const codes = s.places.includes(iso3) ? s.places.filter((c) => c !== iso3) : [...s.places, iso3];
      return { ...s, places: byName(codes.map((c) => byCode.get(c)!).filter(Boolean)).map((p) => p.iso3) };
    });
  const toggleKind = (k: KindKey) =>
    setState((s) => {
      const kinds = new Set(s.kinds);
      if (kinds.has(k)) kinds.delete(k);
      else kinds.add(k);
      return { ...s, kinds };
    });
  const toggleLane = (l: Lane) =>
    setState((s) => {
      const lanes = new Set(s.lanes);
      if (lanes.has(l)) lanes.delete(l);
      else lanes.add(l);
      return { ...s, lanes };
    });

  const tipNode = tip ? (
    <div
      className={`td-tip${tip.y < 120 ? ' td-tip--below' : ''}`}
      style={{ left: Math.min(Math.max(tip.x, 140), width - 140), top: tip.y }}
      role="presentation"
      aria-hidden="true"
    >
      <p className="td-tip-h">
        {dateText(tip.row)} · {tip.row.place}
      </p>
      <p className="td-tip-l">{sentenceCase(tip.row.label)}</p>
      <p className="td-tip-m">{[copy.laneMark[laneOf(tip.row)], ...rowMeta(tip.row, copy)].join(' · ')}</p>
    </div>
  ) : null;

  return (
    <div className={`td-tool${ready ? ' is-ready' : ''}`} data-live={ready ? '' : undefined}>
      {/* ---- where you operate ---- */}
      <div className="td-inputs js-only">
        <fieldset className="td-field td-places">
          <legend className="td-legend td-legend--places">{copy.placesLegend}</legend>
          <label className="fr-sr" htmlFor="td-q">
            {copy.placesSearch}
          </label>
          <Picker places={places} withheld={withheld} chosen={chosen} copy={copy} onToggle={togglePlace} onClear={() => setPlaces([])} />
        </fieldset>
      </div>

      {/* ---- the readout, the view, its key and the filters ---- */}
      <div className="td-view">
        <p className="td-readout js-only" aria-live="polite">
          {sentence}
        </p>
        <p className="td-loading" aria-hidden="true">
          {copy.loading}
        </p>
        {/* shown only when a shared link's places were not drawn within six seconds (index.astro) */}
        <p className="td-late">{copy.inLate}</p>
        <p className="note td-note-phone">{copy.standingNote}</p>

        <div className={`td-filters js-only${folded ? '' : ' is-open'}`}>
          <button type="button" className="td-fold-toggle" aria-expanded={!folded} aria-controls="td-fold-body" onClick={() => setFolded((f) => !f)}>
            {fill(copy.foldLabel, { n: narrowing(state) })}
          </button>
          <div className="td-fold-body" id="td-fold-body">
            <fieldset className="td-field">
              <legend className="td-legend">{copy.kindLegend}</legend>
              <div className="lab-choice td-chips">
                {KIND_KEYS.map((k) => (
                  <label key={k}>
                    <input type="checkbox" checked={state.kinds.has(k)} onChange={() => toggleKind(k)} />
                    <span>
                      <Glyph kind={k} />
                      {copy.kind[k]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="td-field">
              <legend className="td-legend">{copy.laneLegend}</legend>
              <div className="lab-choice td-chips">
                {LANES.map((l) => (
                  <label key={l}>
                    <input type="checkbox" checked={state.lanes.has(l)} onChange={() => toggleLane(l)} />
                    <span>{copy.lane[l]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="td-filterhint">{copy.filterHint}</p>
          </div>
        </div>

        <div className="td-key js-only">
          {/* the key to the marks, once there are marks: each shape drawn, then whose record a mark is */}
          {chosen.length > 0 && shown.length > 0 && (
            <div className="td-marks" role="group" aria-label={copy.marksLegend}>
              <ul className="td-marks-row">
                {drawnKinds.map((k) => (
                  <li key={k}>
                    <Glyph kind={k} />
                    {copy.kind[k]}
                  </li>
                ))}
              </ul>
              <ul className="td-marks-row">
                <li>
                  <Glyph kind="plan" mark="own" />
                  {copy.marksOwn}
                </li>
                <li>
                  <Glyph kind="plan" mark="membership" />
                  {copy.marksMembership} ({copy.membershipLower})
                </li>
                {hasLeads && (
                  <li>
                    <Glyph kind="plan" mark="lead" />
                    {copy.marksLead}
                  </li>
                )}
              </ul>
            </div>
          )}
          {/* why the "In law" lane stands empty, said from the records rather than left to guess */}
          {law && <p className="td-lawnote">{law}</p>}
        </div>

        <div className="td-chartwrap js-only" ref={wrap}>
          {chosen.length ? (
            <>
              <Chart rows={shown} chosen={chosen} copy={copy} width={width} onTip={setTip} />
              {tipNode}
            </>
          ) : (
            <p className="fr-empty td-empty">{copy.chartEmpty}</p>
          )}
        </div>

        <div className="td-phone js-only">
          <h2 className="fr-sr">{copy.yearsHeading}</h2>
          {chosen.length ? (
            <>
              {yearMeta.shared && <p className="td-item-m td-years-m">{yearMeta.shared}</p>}
              <ol className="td-years">
                {years.map(({ year, items }) => (
                  <li key={year} className="td-yr">
                    <h3 className="td-yr-h">{year}</h3>
                    <ul className="td-yr-list">
                      {items.map(({ key, rows: rs }) => {
                        const meta = yearMeta.rows.get(key);
                        return (
                          <li key={key} className="td-item">
                            <ul className="td-item-p">
                              {rs.map((r) => (
                                <li key={r.key}>
                                  <Glyph kind={kindKey(r.kind)} mark={markOf(r)} />
                                  <PlaceName place={byCode.get(r.iso3)!} copy={copy} />
                                </li>
                              ))}
                            </ul>
                            <p className="td-item-l">{sentenceCase(rs[0].label)}</p>
                            {meta && <p className="td-item-m">{meta}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="fr-empty td-empty">{copy.listEmpty}</p>
          )}
        </div>
      </div>

      {/* ---- Show as a table: rendered on the server too, so it is the page's view without JavaScript ---- */}
      <details
        className="lab-table td-table"
        ref={table}
        open={tableOpen}
        onToggle={(e) => {
          const open = e.currentTarget.open;
          if (open === tableOpen) return; // the island set it
          touched.current = true;
          setTableOpen(open);
        }}
      >
        <summary>{chosen.length ? copy.tableSummary : copy.tableSummaryAll}</summary>
        <TdTable
          rows={shown}
          places={places}
          links={links}
          copy={copy}
          audiences={audiences}
          caption={chosen.length ? fill(copy.tableCaption, { places: joinAnd(chosen.map((p) => p.inSentence)) }) : copy.tableCaptionAll}
        />
      </details>

      <div className="js-only">
        <ShareBar
          title={copy.imageTitle}
          sourceLine={copy.imageSource}
          asOf={asOfLabel}
          csv={csv.rows.length ? { filename: copy.csvFile, header: csv.header, rows: csv.rows } : null}
        />
      </div>

      {next.length > 0 && (
        <nav className="fr-next td-next" aria-labelledby="td-next-h">
          <h2 className="fr-h" id="td-next-h">
            {copy.nextHeading}
          </h2>
          <ul>
            {next.map((l) => (
              <li key={l.href}>
                <a href={l.href}>
                  <span className="fr-next-label">{l.label}</span>
                  <span className="fr-next-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
