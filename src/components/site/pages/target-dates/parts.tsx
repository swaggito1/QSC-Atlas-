// Target dates: the marks, the place name and the table, shared by the island and by the static
// table the page prints inside <noscript> for a visitor without JavaScript.
//
// The shape of a mark gives the kind of date; its fill says whose record it is: solid for the
// place's own, open for one that reaches it through EU membership, dotted ink-faint for a lead
// (preview builds only). Colour appears only as the posture dot, always beside its short label.

import type { ReactNode } from 'react';
import { bindingLabel, dateText, fill, groupByPlace, kindKey, scopeText, sentenceCase, statusLabel } from './model';
import type { KindKey, TdCopy, TdLinks, TdPlace, TdRow } from './model';

export type Mark = 'own' | 'membership' | 'lead';
export const markOf = (r: Pick<TdRow, 'lead' | 'relation'>): Mark => (r.lead ? 'lead' : r.relation === 'membership' ? 'membership' : 'own');

/** One mark at (cx, cy): its shape gives the kind of date, its fill whose record it is. */
export function Shape({ kind, mark, cx, cy, scale = 1 }: { kind: KindKey; mark: Mark; cx: number; cy: number; scale?: number }) {
  const s = scale;
  const cls = `td-shape td-shape--${mark}`;
  switch (kind) {
    case 'plan':
      return <circle className={cls} cx={cx} cy={cy} r={5.5 * s} />;
    case 'priority':
      return <polygon className={cls} points={`${cx},${cy - 6.6 * s} ${cx + 6.6 * s},${cy} ${cx},${cy + 6.6 * s} ${cx - 6.6 * s},${cy}`} />;
    case 'complete':
      return <rect className={cls} x={cx - 5 * s} y={cy - 5 * s} width={10 * s} height={10 * s} />;
    case 'procurement':
      return <polygon className={cls} points={`${cx},${cy - 6.4 * s} ${cx + 6.4 * s},${cy + 5 * s} ${cx - 6.4 * s},${cy + 5 * s}`} />;
    case 'other':
      return <rect className={cls} x={cx - 6.5 * s} y={cy - 2.5 * s} width={13 * s} height={5 * s} />;
    default:
      return <rect className={cls} x={cx - 2 * s} y={cy - 7 * s} width={4 * s} height={14 * s} />;
  }
}

/** A mark on its own, beside a word: in the chips, the key, the list and the table. */
export function Glyph({ kind, mark = 'own' }: { kind: KindKey; mark?: Mark }) {
  return (
    <svg className="td-glyph" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <Shape kind={kind} mark={mark} cx={8} cy={8} scale={0.95} />
    </svg>
  );
}

/** The posture dot: the one place colour appears. The pale no-posture swatch where none is recorded. */
export function Dot({ place }: { place: TdPlace }) {
  return place.posture ? (
    <span className="td-dot" style={{ background: place.posture.color }} aria-hidden="true" />
  ) : (
    <span className="td-dot td-dot--none" aria-hidden="true" />
  );
}

/** A place: the dot, the name, and the posture's short label from POSTURE_META. */
export function PlaceName({ place, copy }: { place: TdPlace; copy: TdCopy }) {
  return (
    <span className="td-pname">
      <Dot place={place} />
      <span className="td-pname-n">{place.name}</span>
      <span className="td-pname-p">{place.posture?.short ?? copy.placesNoPosture}</span>
    </span>
  );
}

export const NotRecorded = ({ copy }: { copy: TdCopy }) => <span className="td-nr">{copy.notRecorded}</span>;

interface TableProps {
  rows: TdRow[];
  places: TdPlace[];
  links: TdLinks;
  copy: TdCopy;
  audiences: Record<string, string>;
  caption: string;
}

/**
 * "Show as a table": place by place in alphabetical order, each place's dates in date order.
 * A kind, an issuer, a status or a bindingness the Atlas has not recorded reads "not recorded";
 * nothing is inferred. Who a guide is written for is said on its first row in each place only.
 * Every row carries its source links, so they are index links (global.css .row-link): ink words
 * on a thin teal underline, and the table keeps one teal mass (Swann, 4 October 2026).
 * Under 640px the rows become hairline-ruled blocks (lab.css, .is-stack).
 */
export function TdTable({ rows, places, links, copy, audiences, caption }: TableProps) {
  const byCode = new Map(places.map((p) => [p.iso3, p]));
  const sourceCell = (r: TdRow): ReactNode => {
    const parts: ReactNode[] = [];
    if (r.origin === 'guide') {
      if (r.sourceUrl)
        parts.push(
          <a key="s" className="row-link" href={r.sourceUrl} rel="noopener">
            {r.guideTitle ?? copy.sourceLink}
          </a>,
        );
      const page = r.guide ? links.guidePages[r.guide] : null;
      if (page)
        parts.push(
          <a key="g" className="row-link" href={page}>
            {copy.guideLink}
          </a>,
        );
    } else {
      const profile = byCode.get(r.iso3)?.profile;
      if (profile)
        parts.push(
          <a key="p" className="row-link" href={`${profile}#timeline`}>
            {fill(copy.profileLink, { place: r.place })}
          </a>,
        );
      if (r.sourceUrl)
        parts.push(
          <a key="s" className="row-link" href={r.sourceUrl} rel="noopener">
            {copy.sourceLink}
          </a>,
        );
    }
    return parts.length ? <span className="td-links">{parts}</span> : <NotRecorded copy={copy} />;
  };

  return (
    <div className="lab-scroll td-scroll" role="region" aria-label={copy.tableSummary} tabIndex={0}>
      <table className="is-stack">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{copy.col.when}</th>
            <th scope="col">{copy.col.kind}</th>
            <th scope="col">{copy.col.label}</th>
            <th scope="col">{copy.col.issuer}</th>
            <th scope="col">{copy.col.scope}</th>
            <th scope="col">{copy.col.status}</th>
            <th scope="col">{copy.col.bindingness}</th>
            <th scope="col">{copy.col.source}</th>
          </tr>
        </thead>
        {groupByPlace(rows, places).map(({ place, rows: rs }) => {
          // who a guide is written for, in its own words, is said once per guide in each place
          const told = new Set<string>();
          const scopeOf = (r: TdRow) => {
            const once: Record<string, string> = r.guide && !told.has(r.guide) && audiences[r.guide] ? { [r.guide]: audiences[r.guide] } : {};
            if (r.guide && audiences[r.guide]) told.add(r.guide);
            return scopeText(r, copy, once);
          };
          return (
            <tbody key={place.iso3}>
              <tr className="td-grp">
                <th scope="rowgroup" colSpan={8}>
                  <PlaceName place={place} copy={copy} />
                </th>
              </tr>
              {rs.map((r) => (
                <tr key={r.key} className={r.lead ? 'td-row--lead' : undefined}>
                  <th scope="row" className="td-mono">
                    {dateText(r)}
                    {r.lead && <span className="td-leadtag">{copy.leadTag}</span>}
                  </th>
                  <td data-label={copy.col.kind}>
                    <span className="td-kind">
                      <Glyph kind={kindKey(r.kind)} mark={markOf(r)} />
                      {r.kind ? copy.kind[r.kind] : <NotRecorded copy={copy} />}
                    </span>
                  </td>
                  <td data-label={copy.col.label}>{sentenceCase(r.label)}</td>
                  <td data-label={copy.col.issuer}>{r.issuer ?? <NotRecorded copy={copy} />}</td>
                  <td data-label={copy.col.scope}>{scopeOf(r) ?? ''}</td>
                  <td data-label={copy.col.status}>{statusLabel(r, copy) ?? <NotRecorded copy={copy} />}</td>
                  <td data-label={copy.col.bindingness}>{bindingLabel(r, copy) ?? <NotRecorded copy={copy} />}</td>
                  <td data-label={copy.col.source}>{sourceCell(r)}</td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
