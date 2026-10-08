import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { postureMeta } from '../lib/process';

// The Countries map view (/map): the world drawn from the site's own copy of the Natural Earth
// shapes, each country filled with the colour of the coordination posture its profile records
// (POSTURE_META, the one colour role) or the pale fill when none is recorded. A shape the Atlas
// holds no record for is left in the paper colour, so the map never claims a record it does not
// have. The key is the page's ReadKey, passed in as children so it is drawn between the map and
// its actions; nothing here draws a second legend.
//
// Every place with a profile opens it: a click with a mouse or pen goes straight there (with a
// modifier key or the middle button, in a new tab); on a touch screen the first tap names the
// place, with "Open profile", and a second tap on the same place opens it. On phones that name
// stands in a ruled line under the map, so it never covers the neighbours a visitor zoomed in to
// reach. Places too small for the 1:110m shapes are drawn as dots at their centre point. The
// view is role="img"; the keyboard route is the list view ("Show as a list"), which holds the
// same records as text. Zoom to Europe changes only the view box (and, on phones, gives the frame
// a square shape), moves only when the visitor asks and never under reduced motion. It is a
// toggle with one label: pressed while Europe is shown (aria-pressed), the kit's pressed look.

export interface MapPlace {
  iso3: string;
  name: string;
  posture: string | null; // a POSTURE_META key, or null when no posture is recorded
  eu: boolean; // an EU Member State, from the membership data (never inferred from the posture)
  href: string | null; // the built profile, from the page (never a route string held here)
  shape: string | null; // the shape's id in the topology, or "name:{name}" where it has none
  point: [number, number] | null; // [longitude, latitude] for a dot when no shape is drawn
}

interface Props {
  places: MapPlace[];
  sources: string[]; // the shapes: the site's own copy first, then the fallback
  listHref: string | null;
  offMap: { name: string; href: string | null }[]; // profiles with no place on a map (the EU, NATO)
  children?: ReactNode; // the key
}

type Box = [number, number, number, number];
type Shape = { key: string; d: string; place: MapPlace | null };
type Dot = { place: MapPlace; x: number; y: number };
type Tip = { place: MapPlace; x: number; y: number; pinned: boolean };

const W = 980;
const H = 500;
const WORLD: Box = [0, 0, W, H];
const NONE_FILL = 'var(--process-none)';
const ABSENT_FILL = 'var(--paper)';
const NONE_TEXT = 'No coordination posture recorded';
const EU_TEXT = 'EU Member State';
const DOT_R = 3.4; // a dot's radius in map units at the world view
const NARROW = '(max-width: 699px)'; // phones: a square frame when zoomed, the name under the map

const fillOf = (p: MapPlace | null) => (p ? (postureMeta(p.posture)?.color ?? NONE_FILL) : ABSENT_FILL);

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The box around the EU's members, from Portugal and Ireland to Cyprus and from Crete and Malta to
 * the north of Finland, widened to the frame's aspect around its centre.
 */
function europeBox(project: (p: [number, number]) => [number, number] | null, aspect: number): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let lon = -11; lon <= 35; lon += 1) {
    for (let lat = 34; lat <= 71; lat += 1) {
      const p = project([lon, lat]);
      if (!p) continue;
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
  }
  if (!Number.isFinite(x0)) return WORLD;
  let w = x1 - x0;
  let h = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  w *= 1.04;
  h *= 1.04;
  return [cx - w / 2, cy - h / 2, w, h];
}

export default function WorldMap({ places, sources, listHref, offMap, children }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [dots, setDots] = useState<Dot[]>([]);
  const [europe, setEurope] = useState<{ wide: Box; square: Box }>({ wide: WORLD, square: WORLD });
  const [zoomed, setZoomed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [box, setBox] = useState<Box>(WORLD);
  const [tip, setTip] = useState<Tip | null>(null);
  const [frameW, setFrameW] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<string>('mouse');
  const anim = useRef<number | null>(null);
  const zoomedRef = useRef(false);
  const narrowRef = useRef(false);

  const byShape = useMemo(() => {
    const m = new Map<string, MapPlace>();
    for (const p of places) if (p.shape) m.set(p.shape, p);
    return m;
  }, [places]);
  const byIso = useMemo(() => new Map(places.map((p) => [p.iso3, p])), [places]);

  // the box Zoom to Europe shows: square on phones, where the frame turns square, else the map's shape
  const europeFor = (eu: { wide: Box; square: Box }, isNarrow: boolean) => (isNarrow ? eu.square : eu.wide);

  // Phones: follow the width, so a turn of the device keeps the zoomed view whole.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(NARROW);
    const set = () => {
      narrowRef.current = mq.matches;
      setNarrow(mq.matches);
    };
    set();
    mq.addEventListener?.('change', set);
    return () => mq.removeEventListener?.('change', set);
  }, []);

  // The frame's width on screen, so a dot keeps a size a finger can reach when zoomed.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    setFrameW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Load the shapes: the site's own copy first, then each fallback in turn; a text retry after all fail.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    (async () => {
      for (const src of sources) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try {
          const res = await fetch(src, { signal: ctrl.signal });
          if (!res.ok) throw new Error(`status ${res.status}`);
          const world = await res.json();
          if (!world?.objects?.countries) throw new Error('no countries object');
          if (!alive) return;
          const fc: any = feature(world, world.objects.countries);
          const feats = fc.features.filter((f: any) => String(f.id) !== '010'); // Antarctica
          const projection = geoNaturalEarth1().fitSize([W, H], { type: 'FeatureCollection', features: feats } as any);
          const gp = geoPath(projection as any);
          const drawn = new Set<string>();
          const out: Shape[] = feats.map((f: any) => {
            const key = f.id != null ? String(f.id) : `name:${f.properties?.name ?? ''}`;
            const place = byShape.get(key) ?? null;
            if (place) drawn.add(place.iso3);
            return { key, d: gp(f) || '', place };
          });
          const pts: Dot[] = [];
          for (const p of places) {
            if (drawn.has(p.iso3) || !p.point) continue;
            const xy = projection(p.point as [number, number]);
            if (xy) pts.push({ place: p, x: xy[0], y: xy[1] });
          }
          const project = (p: [number, number]) => projection(p) as [number, number] | null;
          const eu = { wide: europeBox(project, W / H), square: europeBox(project, 1) };
          setShapes(out);
          setDots(pts);
          setEurope(eu);
          setBox(zoomedRef.current ? europeFor(eu, narrowRef.current) : WORLD); // a zoom asked for while the shapes loaded applies now
          setStatus('ready');
          return;
        } catch {
          // try the next source
        } finally {
          clearTimeout(timer);
        }
      }
      if (alive) setStatus('error');
    })();
    return () => {
      alive = false;
    };
  }, [attempt, sources, places, byShape]);

  // A change of width while zoomed (a phone turned on its side) swaps the box at once.
  useEffect(() => {
    if (status !== 'ready' || !zoomedRef.current) return;
    if (anim.current) cancelAnimationFrame(anim.current);
    setBox(europeFor(europe, narrow));
    // europe only changes when the shapes load, which sets the box itself, so only the width is watched
  }, [narrow]);

  // Escape closes the tooltip, pinned or not
  useEffect(() => {
    if (!tip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTip(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tip]);

  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current);
  }, []);

  // Move the view box to the target: at once under reduced motion or when the frame changes
  // shape (phones), else over a short ease.
  const goTo = useCallback(
    (target: Box, instant: boolean) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      if (instant || reducedMotion()) {
        setBox(target);
        return;
      }
      const from = box;
      const start = performance.now();
      const dur = 320;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        setBox(from.map((v, i) => v + (target[i] - v) * e) as Box);
        anim.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      anim.current = requestAnimationFrame(step);
    },
    [box],
  );

  const toggleZoom = () => {
    const next = !zoomed;
    zoomedRef.current = next;
    setZoomed(next);
    setTip(null);
    if (status === 'ready') goTo(next ? europeFor(europe, narrow) : WORLD, narrow);
  };

  // The place under the pointer, from the data-iso the shapes and dots carry.
  const placeAt = (target: EventTarget | null): MapPlace | null => {
    const el = target instanceof Element ? target.closest('[data-iso]') : null;
    const iso = el?.getAttribute('data-iso');
    return iso ? (byIso.get(iso) ?? null) : null;
  };

  const tipAt = (place: MapPlace, clientX: number, clientY: number, pinned: boolean): Tip | null => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r || !r.width) return null;
    return { place, x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100, pinned };
  };

  const openInNewTab = (href: string) => {
    window.open(href, '_blank', 'noopener');
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointer.current = e.pointerType || 'mouse';
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch' || tip?.pinned) return;
    const place = placeAt(e.target);
    if (!place) {
      if (tip) setTip(null);
      return;
    }
    setTip(tipAt(place, e.clientX, e.clientY, false));
  };

  const onClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    const place = placeAt(e.target);
    if (!place || !place.href) {
      setTip(null);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      openInNewTab(place.href);
      return;
    }
    if (pointer.current === 'touch') {
      if (tip?.pinned && tip.place.iso3 === place.iso3) {
        window.location.assign(place.href);
        return;
      }
      setTip(tipAt(place, e.clientX, e.clientY, true));
      return;
    }
    window.location.assign(place.href);
  };

  // the middle button opens the profile in a new tab, as it would for a link
  const onAuxClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (e.button !== 1) return;
    const place = placeAt(e.target);
    if (!place?.href) return;
    e.preventDefault();
    openInNewTab(place.href);
  };

  // Dots: the size the world view gives them, with a floor on screen so a finger can reach one;
  // when zoomed, a larger dot and a wider reach, since the dots no longer crowd each other.
  const unitsPerPx = frameW > 0 ? box[2] / frameW : box[2] / W;
  const r = Math.max(DOT_R * (box[2] / W), (zoomed ? 4 : 2) * unitsPerPx);
  const hitR = Math.max(r * 2.4, (zoomed ? 11 : 0) * unitsPerPx);
  const hovered = tip?.place.iso3 ?? null;
  const hoverShapes = hovered ? shapes.filter((s) => s.place?.iso3 === hovered) : [];
  const hoverDot = hovered ? dots.find((d) => d.place.iso3 === hovered) : undefined;

  // the tooltip keeps inside the frame: anchored left, centred or right, above or below the point
  const tipStyle = (t: Tip) => {
    const tx = t.x < 22 ? '0%' : t.x > 78 ? '-100%' : '-50%';
    const below = t.y < 30;
    return {
      left: `${t.x}%`,
      top: `${t.y}%`,
      transform: `translate(${tx}, ${below ? '14px' : 'calc(-100% - 14px)'})`,
    };
  };

  const postureText = (p: MapPlace) => postureMeta(p.posture)?.short ?? NONE_TEXT;
  const euLine = (p: MapPlace) => !postureMeta(p.posture) && p.eu;

  // on phones a pinned name stands under the map instead of over it
  const floating = tip && status === 'ready' && !(tip.pinned && narrow) ? tip : null;
  const picked = tip?.pinned && narrow ? tip.place : null;

  return (
    <Fragment>
      <div className="wm-map">
        <div className={zoomed ? 'wm-frame is-zoomed' : 'wm-frame'} ref={frameRef}>
          {status === 'ready' ? (
            <svg
              id="wm-svg"
              className="wm-svg"
              viewBox={box.map((v) => Math.round(v * 100) / 100).join(' ')}
              role="img"
              aria-label="World map. Each country is filled with the colour of the coordination posture its Atlas profile records, or a pale fill where none is recorded; places the Atlas holds no record for are left unfilled. The list view holds the same records as text."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerLeave={() => {
                if (!tip?.pinned) setTip(null);
              }}
              onClick={onClick}
              onAuxClick={onAuxClick}
            >
              <g>
                {shapes.map((s, i) => (
                  <path
                    key={`${s.key}-${i}`}
                    d={s.d}
                    className={s.place ? (s.place.href ? 'wm-shape is-link' : 'wm-shape') : 'wm-shape is-absent'}
                    fill={fillOf(s.place)}
                    data-iso={s.place ? s.place.iso3 : undefined}
                  />
                ))}
              </g>
              <g>
                {dots.map((d) => (
                  <g key={d.place.iso3} data-iso={d.place.iso3} className={d.place.href ? 'is-link' : undefined}>
                    <circle cx={d.x} cy={d.y} r={hitR} className="wm-hit" />
                    <circle cx={d.x} cy={d.y} r={r} className="wm-dot" fill={fillOf(d.place)} />
                  </g>
                ))}
              </g>
              <g className="wm-over" aria-hidden="true">
                {hoverShapes.map((s, i) => (
                  <path key={`h-${i}`} d={s.d} className="wm-hover" />
                ))}
                {hoverDot && <circle cx={hoverDot.x} cy={hoverDot.y} r={r * 1.35} className="wm-hover" />}
              </g>
            </svg>
          ) : status === 'error' ? (
            <p className="lab-state wm-state" role="status">
              The map did not load.{' '}
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </p>
          ) : (
            <p className="lab-state wm-state js-only" role="status">
              drawing the world&hellip;
            </p>
          )}
          <p className="wm-state wm-nojs nojs-only">
            <span>
              The map needs JavaScript. {listHref ? <a href={listHref}>The list</a> : 'The list'} holds the same records.
            </span>
          </p>
          {floating && (
            <div className={floating.pinned ? 'lab-tip wm-tip is-pinned' : 'lab-tip wm-tip'} style={tipStyle(floating)}>
              <span className="d" style={{ background: fillOf(floating.place) }} aria-hidden="true" />
              <span className="wm-tip-text">
                <span className="wm-tip-name">{floating.place.name}</span>
                <span className="m">{postureText(floating.place)}</span>
                {euLine(floating.place) && <span className="m">{EU_TEXT}</span>}
                {floating.pinned && floating.place.href && (
                  <a className="wm-tip-open" href={floating.place.href}>
                    Open profile
                  </a>
                )}
              </span>
            </div>
          )}
        </div>
        {status === 'ready' && narrow && (
          <p className="wm-pick" aria-live="polite">
            {picked ? (
              <>
                <span className="wm-pick-d" style={{ background: fillOf(picked) }} aria-hidden="true" />
                <span className="wm-pick-text">
                  <span className="wm-pick-name">{picked.name}</span>{' '}
                  <span className="wm-pick-m">
                    {postureText(picked)}
                    {euLine(picked) ? ` · ${EU_TEXT}` : ''}
                  </span>
                </span>
                {picked.href && (
                  <a className="wm-pick-open" href={picked.href}>
                    Open profile
                  </a>
                )}
              </>
            ) : (
              <span className="wm-pick-hint">Select a country to open its profile.</span>
            )}
          </p>
        )}
      </div>
      {children ? <div className="wm-key">{children}</div> : null}
      <div className="wm-actions">
        <p className="wm-acts">
          <button
            type="button"
            className="lab-btn wm-zoom js-only"
            onClick={toggleZoom}
            aria-pressed={zoomed}
            aria-controls={status === 'ready' ? 'wm-svg' : undefined}
          >
            Zoom to Europe
          </button>
          {listHref && (
            <a className="wm-act" href={listHref}>
              Show as a list
            </a>
          )}
        </p>
        <p className="lab-hint wm-hint">
          <span className="wm-hint-sel">Select a country to open its profile. </span>
          Places too small for this scale are drawn as dots.
        </p>
        {offMap.length > 0 && (
          <p className="wm-off">
            Profiles with no place on the map:{' '}
            <span className="wm-off-links">
              {offMap.map((o, i) => (
                <Fragment key={o.name}>
                  {i > 0 && <span aria-hidden="true">{' · '}</span>}
                  {o.href ? <a href={o.href}>{o.name}</a> : o.name}
                </Fragment>
              ))}
            </span>
          </p>
        )}
      </div>
    </Fragment>
  );
}
