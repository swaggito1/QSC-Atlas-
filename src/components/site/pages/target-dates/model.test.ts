// Target dates: what a chart mark says, to a screen reader and in its tooltip. Lifecycle status and
// bindingness are two labels, never one, and the lane a mark is drawn in is named with them, so a
// binding instrument that is only a proposal is never announced as law. How the place search
// orders what it finds, closest first. And how the list by year says once what every target in it
// shares, without dropping or adding a word.
//
// vitest.config.ts includes this folder's tests through src/components/site/pages/**/*.test.ts.
import { describe, expect, it } from 'vitest';
import { targetDatesData } from './data';
import { groupByYear, laneOf, markText, matchPlaces, rowMeta, yearListMeta } from './model';
import type { TdRow } from './model';

const { copy } = targetDatesData();

// a made-up row, for the rule only: no date or label here is shown on any page
const row = (over: Partial<TdRow>): TdRow => ({
  iso3: 'FRA',
  place: 'France',
  year: 2030,
  month: null,
  label: 'an example line',
  kind: 'complete',
  status: null,
  bindingness: null,
  issuer: null,
  scope: null,
  sourceUrl: null,
  relation: 'own',
  origin: 'profile',
  lead: false,
  guide: null,
  guideTitle: null,
  display: null,
  key: 'FRA-0',
  ...over,
});

describe('Target dates, what a mark says', () => {
  it('names a binding proposal as a proposal, in the not-recorded lane, never only as binding law', () => {
    const r = row({ status: 'proposal', bindingness: 'binding-law' });
    expect(laneOf(r)).toBe('none');
    const text = markText(r, copy);
    expect(text).toContain(copy.laneMark.none);
    expect(text).toContain(copy.status.proposal);
    expect(text).toContain(copy.bindingness['binding-law']);
    expect(text).not.toContain(copy.laneMark.law);
    // the lane comes first, so the bindingness is never heard before it
    expect(text.indexOf(copy.laneMark.none)).toBeLessThan(text.indexOf(copy.bindingness['binding-law']));
  });

  it('names the lane, the status and the bindingness of a published guidance target', () => {
    const r = row({ status: 'published', bindingness: 'soft-law', relation: 'membership', kind: 'plan', month: 12, year: 2026 });
    expect(laneOf(r)).toBe('guidance');
    expect(markText(r, copy)).toBe(
      `December 2026, France: An example line (${copy.laneMark.guidance}; ${copy.kind.plan}; ${copy.status.published}; ${copy.bindingness['soft-law']}; ${copy.membership})`,
    );
  });

  it('says "not recorded" for a status and a bindingness the Atlas has not recorded', () => {
    const meta = rowMeta(row({ kind: null }), copy);
    expect(meta).toEqual([copy.kind.none, copy.statusNotRecorded, copy.bindingNotRecorded]);
  });

  it('keeps status and bindingness as two separate labels in every combination', () => {
    for (const status of Object.keys(copy.status)) {
      for (const bindingness of Object.keys(copy.bindingness)) {
        const meta = rowMeta(row({ status: status as TdRow['status'], bindingness: bindingness as TdRow['bindingness'] }), copy);
        expect(meta[1]).toBe(copy.status[status]);
        expect(meta[2]).toBe(copy.bindingness[bindingness]);
      }
    }
  });
});

describe('Target dates, the place search', () => {
  // made-up places, for the rule only: none of them is shown on any page
  const place = (iso3: string, name: string, aliases: string[] = []) => ({ iso3, name, aliases });
  const list = [
    place('AAA', 'Alderland', ['North Alder']),
    place('BBB', 'Balderia', ['Bald.']),
    place('CCC', 'Côte Verte', ['CV']),
    place('DDD', 'Deland'),
  ];
  const codes = (q: string) => matchPlaces(list, q).map((p) => p.iso3);

  it('puts an exact name, code or alias first, then names that start with the query', () => {
    expect(codes('bbb')).toEqual(['BBB']);
    expect(codes('cv')[0]).toBe('CCC');
    expect(codes('de')).toEqual(['DDD']);
  });

  it('ignores case, accents and full stops', () => {
    expect(codes('COTE')).toEqual(['CCC']);
    expect(codes('bald')[0]).toBe('BBB');
  });

  it('matches inside a name from three letters only, after every closer match', () => {
    expect(codes('ld')).toEqual([]);
    expect(codes('lde')).toEqual(['AAA', 'BBB']);
    expect(codes('alder')).toEqual(['AAA', 'BBB']);
  });

  it('gives every place for an empty query', () => {
    expect(codes('  ')).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
  });

  it('finds the European Union by "EU", as the field invites', () => {
    const { places } = targetDatesData();
    expect(matchPlaces(places, 'EU')[0]?.iso3).toBe('EUU');
  });
});

describe('Target dates, the list by year says once what every target shares', () => {
  const list = (rows: TdRow[]) => yearListMeta(groupByYear(rows), copy);
  const triple = [copy.kind.none, copy.statusNotRecorded, copy.bindingNotRecorded].join(' · ');

  it('says the shared "not recorded" line once above the list, and keeps each target its own date', () => {
    const rows = [row({ kind: null, year: 2030, key: 'a' }), row({ kind: null, year: 2031, month: 6, label: 'another line', key: 'b' })];
    const m = list(rows);
    expect(m.shared).toBe(triple);
    expect([...m.rows.values()]).toEqual(['', 'June 2031']);
  });

  it('keeps on each target the parts in which it differs, and says the rest once', () => {
    const rows = [
      row({ kind: 'plan', status: 'published', bindingness: 'soft-law', year: 2026, key: 'a' }),
      row({ kind: 'complete', status: 'published', bindingness: 'soft-law', year: 2035, label: 'another line', key: 'b' }),
    ];
    const m = list(rows);
    expect(m.shared).toBe(`${copy.status.published} · ${copy.bindingness['soft-law']}`);
    expect([...m.rows.values()]).toEqual([copy.kind.plan, copy.kind.complete]);
  });

  it('moves nothing when no part is shared by every target, or when there is one target only', () => {
    const mixed = [row({ kind: null, year: 2030, key: 'a' }), row({ kind: 'plan', status: 'published', bindingness: 'soft-law', year: 2026, key: 'b' })];
    const m = list(mixed);
    expect(m.shared).toBe('');
    expect([...m.rows.values()]).toContain(triple);
    const one = list([row({ kind: null, key: 'a' })]);
    expect(one.shared).toBe('');
    expect([...one.rows.values()]).toEqual([triple]);
  });

  it('loses no word: each target still reads every part, between the list line and its own', () => {
    const { rows, places } = targetDatesData();
    for (const code of ['DEU', 'FRA', 'EUU', 'USA', 'GBR']) {
      const mine = rows.filter((r) => r.iso3 === code);
      if (!mine.length) continue;
      const groups = groupByYear(mine);
      const m = yearListMeta(groups, copy);
      for (const item of groups.flatMap((g) => g.items)) {
        const said = `${m.shared} · ${m.rows.get(item.key)}`.toLowerCase();
        for (const part of rowMeta(item.rows[0], copy)) expect(said, `${code} ${item.key}`).toContain(part.toLowerCase());
      }
      expect(places.some((p) => p.iso3 === code)).toBe(true);
    }
  });
});
