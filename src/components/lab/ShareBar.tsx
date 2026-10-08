// QSC Atlas: the quiet actions under a view (spec 11, item 12), as teal text links in the
// interface face, joined by middle dots: "Copy link · Download CSV · Download image · Print".
// "Copy link" copies the page address; every tool keeps its settings in the query string and
// private marks only in the hash, so the link reproduces the view. "Download CSV" writes the
// rows the island hands it (only when it hands some). "Download image" renders a 1200 by 630
// PNG from the tool's own chart, with the title, the source line and the "as of" date burnt in;
// the selector may list several charts (an SVG and a canvas globe) and the first visible one is
// used; while it is drawn the button says so (aria-busy, the progress cursor) and a second press
// does nothing. "Print" opens the browser's print dialog; each page's print stylesheet decides
// what prints. Nothing leaves the page. In the image the source line and the as-of line are words,
// so they are set in the interface face, as the page sets them.
// Styles live in src/styles/lab.css (.share-bar, .share-btn): an island renders no inline <style>.

import { Fragment, useRef, useState } from 'react';

type Cell = string | number | null | undefined;

interface Props {
  svgSelector?: string; // CSS selector for the chart: an <svg> or a <canvas>, or a list of both
  title: string;
  lines?: string[]; // up to three short lines burnt in under the title (a readout, a list)
  sourceLine: string; // e.g. "Source: QSC Atlas, from NIST and national agency documents"
  asOf: string; // e.g. "30 September 2026"
  filename?: string; // the image's file name
  csv?: { filename: string; header: string[]; rows: Cell[][] } | null; // the view's data, as a table
  print?: boolean; // show "Print" (default true)
  copyLink?: boolean; // show "Copy link" (default true)
}

const W = 1200;
const H = 630;
const PAD = 56;

// Properties copied inline so the SVG looks the same once it leaves the page's stylesheet.
const STYLE_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'visibility', 'display',
  'transform', 'transform-origin', 'transform-box', 'width', 'height', 'paint-order',
];

function inlineStyles(source: Element, clone: Element) {
  const src = [source, ...Array.from(source.querySelectorAll('*'))];
  const dst = [clone, ...Array.from(clone.querySelectorAll('*'))];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    dst[i]?.setAttribute('style', STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
  });
}

async function svgImage(svg: SVGSVGElement): Promise<{ img: HTMLImageElement; w: number; h: number }> {
  const box = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  clone.setAttribute('width', String(box.width));
  clone.setAttribute('height', String(box.height));
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('the chart could not be drawn as an image'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  });
  return { img, w: box.width, h: box.height };
}

function token(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Shorten text with an ellipsis until it fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '\u2026').width > width) t = t.slice(0, -1);
  return t + '\u2026';
}

/** The first chart the selector matches that is actually on screen. */
function visibleChart(selector: string): SVGSVGElement | HTMLCanvasElement | null {
  const all = Array.from(document.querySelectorAll<SVGSVGElement | HTMLCanvasElement>(selector));
  return all.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

async function renderPng(props: Props & { svgSelector: string }): Promise<Blob> {
  const chart = visibleChart(props.svgSelector);
  if (!chart) throw new Error('no chart was found on this page');
  await document.fonts?.ready;
  let img: CanvasImageSource;
  let w: number;
  let h: number;
  if (chart instanceof HTMLCanvasElement) {
    const r = chart.getBoundingClientRect();
    img = chart;
    w = r.width;
    h = r.height;
  } else {
    ({ img, w, h } = await svgImage(chart));
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const ink = token('--ink', '#202425');
  const muted = token('--ink-muted', '#4b5153');
  const hairline = token('--hairline', '#d9d6cf');

  ctx.fillStyle = token('--paper', '#f7f5f0');
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = ink;
  ctx.font = '500 36px Newsreader, Georgia, serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fit(ctx, props.title, W - 2 * PAD), PAD, PAD + 30);

  // up to three lines of context under the title
  ctx.font = '400 17px "Schibsted Grotesk", system-ui, sans-serif';
  ctx.fillStyle = muted;
  const lines = (props.lines ?? []).slice(0, 3);
  lines.forEach((line, i) => ctx.fillText(fit(ctx, line, W - 2 * PAD), PAD, PAD + 62 + i * 24));

  // the chart, scaled to fit between the title and the footer
  const top = PAD + 60 + lines.length * 24;
  const bottom = H - 84;
  const scale = Math.min((W - 2 * PAD) / w, (bottom - top) / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(img, PAD + (W - 2 * PAD - dw) / 2, top + (bottom - top - dh) / 2, dw, dh);

  ctx.strokeStyle = hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 64);
  ctx.lineTo(W - PAD, H - 64);
  ctx.stroke();

  ctx.font = '400 16px "Schibsted Grotesk", system-ui, sans-serif';
  const right = `QSC Atlas, as of ${props.asOf}`;
  const rightW = ctx.measureText(right).width;
  ctx.fillStyle = muted;
  ctx.fillText(fit(ctx, props.sourceLine, W - 2 * PAD - rightW - 32), PAD, H - 32);
  ctx.fillStyle = ink;
  ctx.fillText(right, W - PAD - rightW, H - 32);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the image could not be created'))), 'image/png'),
  );
}

/** One CSV field: quoted when it holds a comma, a quote or a line break. */
function csvField(v: Cell): string {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

function save(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export default function ShareBar(props: Props) {
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const { copyLink: showCopy = true, print: showPrint = true } = props;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus('Link copied. It opens this view as you see it now.');
    } catch {
      setStatus('The link could not be copied here; copy it from the address bar.');
    }
  }

  function downloadCsv() {
    if (!props.csv) return;
    // a byte order mark, so a spreadsheet reads accented names correctly
    save(new Blob(['\uFEFF' + toCsv(props.csv.header, props.csv.rows)], { type: 'text/csv;charset=utf-8' }), props.csv.filename);
    const n = props.csv.rows.length;
    setStatus(`CSV downloaded, ${n} ${n === 1 ? 'row' : 'rows'}.`);
  }

  async function downloadImage() {
    if (busy.current || !props.svgSelector) return;
    busy.current = true;
    setWorking(true);
    setStatus('Preparing the image.');
    try {
      const blob = await renderPng(props as Props & { svgSelector: string });
      save(blob, props.filename ?? 'qsc-atlas.png');
      setStatus('Image downloaded, 1200 by 630 pixels.');
    } catch (err) {
      setStatus(`The image could not be made: ${(err as Error).message}.`);
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  const actions: { key: string; label: string; run: () => void }[] = [];
  if (showCopy) actions.push({ key: 'copy', label: 'Copy link', run: copyLink });
  if (props.csv) actions.push({ key: 'csv', label: 'Download CSV', run: downloadCsv });
  if (props.svgSelector) actions.push({ key: 'image', label: 'Download image', run: downloadImage });
  if (showPrint) actions.push({ key: 'print', label: 'Print', run: () => window.print() });

  return (
    <div className="share-bar">
      {actions.map((a, i) => (
        <Fragment key={a.key}>
          {i > 0 && <span className="dot-sep" aria-hidden="true" />}
          <button
            type="button"
            className="share-btn"
            onClick={a.run}
            aria-busy={a.key === 'image' && working ? true : undefined}
          >
            {a.label}
          </button>
        </Fragment>
      ))}
      <p className="share-status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
