// The Exposure Clock island and its chart as the server renders them, with the props the page
// gives them: no presentation control in view, no date called a deadline, the options in a
// wrapping row, the standards bodies' dates in their own group, Belgium's restated EU roadmap
// years drawn once, and every date mark and year label at its own year on the axis. Then what
// keeps the page still: the chart's height never depends on a slider, the first paint holds the
// chart at its own height, and a glide starts where the chart stands and ends exactly on target.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import ExposureClock, { ShelfNote } from './ExposureClock';
import ExposureChart from './ExposureChart';
import { layoutChart, mixFrames } from './chart-layout';
import { easeOut } from './motion';
import { LIMITS, START_SPAN, computeExposure, periodFor, placesWithPeriod, readoutSentences, surveyedAtOrBefore } from '../../../../lib/lab/exposure';
import { loadExposure } from '../../../../lib/lab/exposure-data';
import type { LoadOptions } from '../../../../lib/lab/load';

function islandProps(opts: LoadOptions = {}) {
  // exactly what index.astro passes: everything but the decisions, sources, as-of date, frame
  // and the survey's own definition, which is a source's words
  const { decisions, sources, asOf, frame, surveyDefinition, ...island } = loadExposure(opts);
  return { ...island, asOfLabel: '30 September 2026' };
}

const visibleText = (html: string) => html.replace(/<[^>]+>/g, ' ');
// the text a sentence reads as: React's separators gone, runs of space made one
const sentence = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the Exposure Clock island', () => {
  const html = renderToString(createElement(ExposureClock, islandProps()));

  it('shows no presentation control; ?present=1 is the only way in', () => {
    expect(html).not.toMatch(/Presentation mode/i);
    expect(html).not.toMatch(/Leave presentation mode/);
  });

  it('calls no date a deadline in what a visitor reads', () => {
    expect(visibleText(html)).not.toMatch(/deadline/i);
    expect(html).toContain('Published target dates');
  });

  it('lays the options out in the shared choice row, which wraps', () => {
    expect(html).toMatch(/class="lab-choice xc-choices"/);
  });

  it('asks how long the data must stay secret first, and names no eyebrow label', () => {
    const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
    const order = ['How long must it stay secret?', 'How long will your migration take?', 'Where are you based?', 'What do you protect?'].map((t) => form.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(form).toMatch(/class="sr-only"[^>]*>Your situation</);
    expect(form).toContain('When your migration starts');
    expect(form).not.toMatch(/>Advanced</);
  });

  it('with no country chosen, lists only the standards bodies, under their own head', () => {
    const dates = html.slice(html.indexOf('class="xc-dates"'));
    expect(dates).toMatch(/<h3[^>]*class="xc-group-head"[^>]*>Standards bodies<\/h3>/);
    expect(dates.match(/class="xc-date-list"/g)).toHaveLength(1);
    expect(dates).toContain('Choose where you are based');
  });

  it('before it knows its width, draws the chart for a phone, the desktop column and a tablet, each holding its own height', () => {
    const first = [...html.matchAll(/<div class="xc-first xc-first--(\d+)"><svg[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*height="([\d.]+)" preserveAspectRatio="xMinYMin meet"/g)];
    expect(first.map((m) => Number(m[1]))).toEqual([342, 464, 720]);
    for (const m of first) {
      expect(Number(m[2])).toBe(Number(m[1]));
      expect(m[4]).toBe(m[3]);
    }
    expect(html).not.toMatch(/drawing the chart/);
  });

  it('carries none of the source words of the survey in the island', () => {
    const definition = loadExposure().surveyDefinition;
    expect(definition).toBeTruthy();
    expect(html).not.toContain(definition!.slice(0, 40));
    expect(JSON.stringify(islandProps())).not.toContain(definition!.slice(0, 40));
  });

  it('with Target dates hidden, names it nowhere in the markup', () => {
    const hidden = renderToString(createElement(ExposureClock, islandProps({ env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'exposure' } })));
    expect(hidden).not.toMatch(/target-dates/);
  });
});

describe('the note under "How long must it stay secret?"', () => {
  const data = loadExposure();
  const eu = (iso3: string) => data.jurisdictions.some((j) => j.iso3 === iso3 && j.eu);
  const nameOf = (iso3: string) => (iso3 === 'EUU' ? data.copy.whereEuName : data.jurisdictions.find((j) => j.iso3 === iso3)?.inSentence ?? '');
  const note = (c: string, j: string, opts: { x?: number; showWords?: boolean } = {}) => {
    const preset = data.presets.find((p) => p.id === c)!;
    const found = periodFor(preset.periods, j, eu);
    const elsewhere = found ? [] : placesWithPeriod(preset.periods, j, (iso3) => nameOf(iso3) || null, eu, data.copy.shelfEuMembers);
    return renderToString(
      createElement(ShelfNote, { copy: data.copy, preset, found, place: j, placeName: nameOf(j), elsewhere, x: opts.x ?? 10, useShown: true, showWords: opts.showWords ?? false }),
    );
  };

  it("names a period's source with a link and says in plain words what kind of period it is", () => {
    const html = note('tax-records', 'DEU', { x: 60 });
    expect(sentence(html)).toContain(`created. ${data.copy.basisClosure} Source: Bundesarchivgesetz, § 11`);
    expect(sentence(html)).toMatch(/^Starts at 60 years:/);
    expect(html).toContain('<a href="https://www.gesetze-im-internet.de/barchg_2017/__11.html" rel="noopener">Bundesarchivgesetz, § 11</a>');
  });
  it('keeps the source words out of the note unless the page is opened for review', () => {
    const p = data.presets.find((x) => x.id === 'tax-records')!.periods.find((d) => d.iso3 === 'DEU')!;
    expect(p.words[0]).toBeTruthy();
    expect(note('tax-records', 'DEU')).not.toContain(p.words[0].slice(0, 40));
    expect(note('tax-records', 'DEU', { showWords: true })).toContain('class="src-words"');
  });
  it('calls a retention period a keeping period and at most a lower bound, never a period of secrecy', () => {
    const html = visibleText(note('financial-transactions', 'FRA'));
    expect(html).toContain('Starts at 5 years:');
    expect(html).toContain('at most a lower bound');
    expect(html).not.toContain(data.copy.basisConfidentiality);
  });
  it('says when the rule sets no end, and that the slider stops at its maximum', () => {
    expect(visibleText(note('trade-secrets', 'none'))).toContain(`The rule sets no end; the slider stops at ${LIMITS.x[1]} years.`);
    expect(sentence(note('citizen-health-records', 'DEU'))).toMatch(/^The rule sets no end; the slider stops at 100 years\. Section 203 of the German Criminal Code/);
    expect(sentence(note('citizen-health-records', 'DEU'))).toContain(`${data.copy.basisConfidentiality} Source: Strafgesetzbuch, § 203`);
  });
  it('says plainly when the Atlas holds no period for the place, and where it holds one', () => {
    expect(sentence(note('tax-records', 'ESP'))).toBe('The Atlas holds no documented period for tax records in Spain, so the slider shows your own value. It holds one for Germany.');
    expect(sentence(note('tax-records', 'none'))).toBe('The Atlas holds no general period for tax records, so the slider shows your own value. Choose where you are based: it holds one for Germany.');
    // a name that takes an article keeps it inside the sentence
    expect(sentence(note('financial-transactions', 'USA'))).toBe('The Atlas holds no documented period for financial transaction records in the United States, so the slider shows your own value. It holds one for every EU Member State.');
  });
  it('offers "Use N years" only as a way back to the sourced period, hidden when the slider is there', () => {
    expect(note('tax-records', 'DEU', { x: 60 })).toMatch(/class="xc-textlink is-spent"/);
    expect(note('tax-records', 'DEU', { x: 12 })).toMatch(/class="xc-textlink">Use 60 years</);
  });
});

describe('the chart keeps every date at its own year', () => {
  const data = loadExposure();
  const svgFor = (iso3: string, width: number, shelf: number) => {
    const result = computeExposure({ now: new Date(Date.UTC(2026, 6, 1)), shelfLifeYears: shelf, migrationYears: 7 });
    return renderToString(createElement(ExposureChart, { width, result, survey: data.survey, deadlines: data.deadlines[iso3], copy: data.copy, checking: false }));
  };
  // the axis's own ticks give the scale back, so a mark is read against what the visitor sees
  const yearAt = (svg: string) => {
    const ticks = [...svg.matchAll(/<g transform="translate\(([\d.]+), [\d.]+\)"><line class="xc-axis"[^>]*><\/line><text class="xc-tick"[^>]*>(\d{4})<\/text><\/g>/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const [a, b] = [ticks[0], ticks[ticks.length - 1]];
    return (px: number) => a[1] + ((px - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
  };

  // Germany has the most dates on one lane; 60 years is the sourced period for its tax records
  for (const [iso3, width, shelf] of [['DEU', 342, 60], ['DEU', 342, 10], ['DEU', 342, 100], ['LTU', 342, 60], ['DEU', 760, 60]] as const) {
    it(`${iso3} at ${width}px with a ${shelf}-year shelf life: every mark and every year label within half a year of its year`, () => {
      const svg = svgFor(iso3, width, shelf);
      const at = yearAt(svg);
      const marks = [...svg.matchAll(/class="xc-marker[^"]*" data-year="(\d{4})" transform="translate\(([\d.]+), /g)].map((m) => [Number(m[1]), Number(m[2])]);
      const labels = [...svg.matchAll(/class="xc-date-year" data-year="(\d{4})" x="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
      expect(marks.length).toBe(data.deadlines[iso3].filter((d) => d.year >= 2026).length);
      for (const [yr, px] of [...marks, ...labels]) expect(Math.abs(at(px) - yr), `${yr} drawn at ${at(px).toFixed(2)}`).toBeLessThanOrEqual(0.5);
      // no year is dropped: every year with a mark has its label
      expect(new Set(labels.map(([yr]) => yr))).toEqual(new Set(marks.map(([yr]) => yr)));
    });
  }
});

describe('the chart and the readout give the same survey figure', () => {
  const data = loadExposure();
  for (const shelf of [10, 12, 15]) {
    it(`with a ${shelf}-year shelf life: the horizon label reads the surveyed range the readout names, never an interpolated one`, () => {
      const result = computeExposure({ now: new Date(Date.UTC(2026, 6, 1)), shelfLifeYears: shelf, migrationYears: 7 });
      const svg = renderToString(createElement(ExposureChart, { width: 760, result, survey: data.survey, deadlines: data.deadlines.none, copy: data.copy, checking: false }));
      const point = surveyedAtOrBefore(data.survey!, result.laterHorizon)!;
      const [lower, upper] = [point.lower, point.upper].map((v) => Math.round(v * 100));
      const readout = readoutSentences(result, { migrationYears: 7 }, data.survey, data.copy as never)[2];
      expect(readout).toContain(`within ${point.horizonYears} years of ${data.survey!.baseYear} at ${lower} to ${upper} per cent`);
      const label = /class="xc-horizon-label"[^>]*>([^<]+)</.exec(svg)?.[1];
      expect(label).toBe(`${lower} to ${upper}% by ${data.survey!.baseYear + point.horizonYears}`);
      expect(svg).not.toMatch(/class="xc-horizon-label[^"]*"[^>]*>about/);
    });
  }
});

describe('the chart for Belgium', () => {
  const data = loadExposure();
  const result = computeExposure({ now: new Date(Date.UTC(2026, 6, 1)), shelfLifeYears: 10, migrationYears: 7 });
  const draw = (width: number) =>
    renderToString(createElement(ExposureChart, { width, result, survey: data.survey, deadlines: data.deadlines.BEL, copy: data.copy, checking: false }));

  for (const width of [342, 760]) {
    it(`draws each restated EU roadmap year once, at ${width}px`, () => {
      const svg = draw(width);
      // three roadmap targets (2026, 2030, 2035) and the two NIST proposals, one mark each
      expect(svg.match(/class="xc-marker/g)).toHaveLength(5);
      expect(svg).toContain('Target dates');
      expect(visibleText(svg)).not.toMatch(/deadline/i);
    });
  }
});

describe('the chart keeps the page still', () => {
  const data = loadExposure();
  const at = (x: number, y: number, s: number) => computeExposure({ now: new Date(Date.UTC(2026, 6, 1)), shelfLifeYears: x, migrationYears: y, migrationStartYear: s });

  it('for every place and width, the chart is as tall whatever the sliders say', () => {
    for (const [iso3, deadlines] of Object.entries(data.deadlines)) {
      for (const width of [312, 342, 464, 720, 760]) {
        const heights = new Set<number>();
        for (const x of [LIMITS.x[0], 10, 30, 60, LIMITS.x[1]]) {
          for (const y of [LIMITS.y[0], 7, LIMITS.y[1]]) {
            for (const s of [2026, 2026 + START_SPAN]) {
              heights.add(layoutChart({ width, result: at(x, y, s), survey: data.survey, deadlines, copy: data.copy }).frame.H);
            }
          }
        }
        expect([...heights], `${iso3} at ${width}px`).toHaveLength(1);
      }
    }
  });

  it('a glide starts where the chart stands, ends exactly on the target, and fades marks in and out where they stand', () => {
    const a = layoutChart({ width: 342, result: at(10, 7, 2026), survey: data.survey, deadlines: data.deadlines.none, copy: data.copy }).frame;
    const b = layoutChart({ width: 342, result: at(60, 7, 2026), survey: data.survey, deadlines: data.deadlines.DEU, copy: data.copy }).frame;
    expect(mixFrames(a, b, 1)).toBe(b);
    const start = mixFrames(a, b, 0);
    expect(start.d1).toBe(a.d1);
    expect(start.today).toBe(a.today);
    // the NIST dates are in both: they move; Germany's own dates fade in where they will stand
    const half = mixFrames(a, b, 0.5);
    const nist = b.marks.find((m) => m.lane === 'standards')!;
    expect(half.marks.find((m) => m.key === nist.key)!.o).toBe(1);
    const own = b.marks.find((m) => m.lane === 'targets')!;
    expect(half.marks.find((m) => m.key === own.key)).toMatchObject({ y: own.y, o: 0.5 });
    // and back again, Germany's dates fade out where they stood
    const back = mixFrames(b, a, 0.5).marks.find((m) => m.key === own.key)!;
    expect(back).toMatchObject({ y: own.y, o: 0.5 });
    expect(mixFrames(b, a, 1).marks.find((m) => m.key === own.key)).toBeUndefined();
  });

  it('eases out: quick at first, settling at the end', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.1)).toBeGreaterThan(0.2);
    expect(easeOut(0.5)).toBeGreaterThan(0.8);
    let last = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      expect(easeOut(t)).toBeGreaterThanOrEqual(last);
      last = easeOut(t);
    }
  });
});
