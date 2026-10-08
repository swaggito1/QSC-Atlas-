// QSC Atlas: screenshot a page of the local dev server with headless Chrome over its debugging
// protocol, at a true device width (a plain --window-size cannot go below about 500px, so a
// phone capture would be cropped). It waits for every island to hydrate and the fonts to load,
// reports any horizontal overflow and the elements causing it, and lets only one Chrome run at a
// time across every caller, so parallel agents cannot fill the disk. Nothing leaves the machine.
//
// Usage: node scripts/lab/shot.mjs URL OUT.png [WIDTH=1440] [HEIGHT=1800] [--full] [--wait=MS]
// --wait adds a pause after hydration, for pages that animate in (the home globe composes
// over about a second).
// Chrome creates its own sockets, so run it outside the command sandbox.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const full = process.argv.includes('--full');
const extraWait = Number((process.argv.find((a) => a.startsWith('--wait=')) ?? '--wait=0').slice(7)) || 0;
const [url, out, w = '1440', h = '1800'] = args;
if (!url || !out) {
  console.error('usage: node scripts/lab/shot.mjs URL OUT.png [WIDTH] [HEIGHT] [--full]');
  process.exit(2);
}
const width = Number(w);
const height = Number(h);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = process.env.TMPDIR || tmpdir();

// one Chrome at a time: a directory lock, broken if older than five minutes
const lock = join(tmp, 'qsc-shot.lock');
async function acquire() {
  for (let i = 0; i < 1200; i++) {
    try {
      mkdirSync(lock);
      return;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > 5 * 60_000) rmSync(lock, { recursive: true, force: true });
      } catch {
        /* the lock went away between the two calls */
      }
      await sleep(500);
    }
  }
  throw new Error('waited ten minutes for another screenshot to finish');
}
const release = () => rmSync(lock, { recursive: true, force: true });

let chrome;
let prof;
async function stopChrome() {
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(3000)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  if (prof) rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

async function main() {
  await acquire();
  const timer = setTimeout(() => {
    console.error('no screenshot: timed out after 180 seconds');
    stopChrome().finally(() => {
      release();
      process.exit(1);
    });
  }, 180_000);
  try {
    prof = mkdtempSync(join(tmp, 'qsc-shot.'));
    const port = 9300 + Math.floor(Math.random() * 600);
    // Node here is an Intel build, and a child inherits its architecture, so Chrome would run
    // under Rosetta and hydrate pages ten times slower; arch -arm64 starts it natively.
    const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const native = process.platform === 'darwin' && process.arch === 'x64';
    chrome = spawn(
      native ? '/usr/bin/arch' : chromeBin,
      [
        ...(native ? ['-arm64', chromeBin] : []),'--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, 'about:blank'],
      { stdio: 'ignore' },
    );
    let target;
    // under memory pressure Chrome can take half a minute to start
    for (let i = 0; i < 240 && !target; i++) {
      await sleep(250);
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
      } catch {
        /* Chrome is still starting */
      }
    }
    if (!target) throw new Error('Chrome did not start');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m.result);
        pending.delete(m.id);
      }
    });
    const send = (method, params = {}) =>
      new Promise((r) => {
        pending.set(++id, r);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const val = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))?.result?.value;

    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Page.enable');
    // islands that hydrate when visible would never hydrate in a still capture: treat every
    // observed element as on screen, as a visitor scrolling past it would
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source:
        'window.IntersectionObserver = class { constructor(cb){ this.cb = cb; } observe(el){ setTimeout(() => this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1, boundingClientRect: el.getBoundingClientRect() }], this), 30); } unobserve(){} disconnect(){} takeRecords(){ return []; } };',
    });
    const ready = `(async () => {
      if (document.readyState !== 'complete') return false;
      if (document.querySelector('astro-island[ssr]')) return false;
      await document.fonts.ready;
      return true;
    })()`;
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      await send('Page.navigate', { url }); // style-scan-ignore (a Chrome protocol method name)
      for (let i = 0; i < 50 && !ok; i++) {
        await sleep(300);
        ok = await val(ready);
      }
    }
    await sleep(700 + extraWait); // let first-layout transitions and canvas draws settle
    const metrics = await val(`(() => {
      const vw = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll('body *')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed'; })
        .slice(0, 5)
        .map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + ' right=' + Math.round(el.getBoundingClientRect().right));
      return { clientWidth: vw, scrollWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, overflowing: wide };
    })()`);
    const params = { format: 'png' };
    if (full && metrics) {
      params.captureBeyondViewport = true;
      params.clip = { x: 0, y: 0, width, height: Math.min(metrics.pageHeight, 16000), scale: 1 };
    }
    const shot = await send('Page.captureScreenshot', params);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    const overflow = metrics && metrics.scrollWidth > metrics.clientWidth ? `HORIZONTAL OVERFLOW ${metrics.scrollWidth}px > ${metrics.clientWidth}px: ${metrics.overflowing.join(', ')}` : 'no horizontal overflow';
    console.log(`${ok ? 'saved' : 'saved (page not fully ready)'} ${out} at ${width}x${height}${full ? ' full page' : ''}; ${overflow}`);
    ws.close();
  } finally {
    clearTimeout(timer);
    await stopChrome();
    release();
  }
}

main().catch((err) => {
  console.error('no screenshot:', err.message);
  process.exit(1);
});
