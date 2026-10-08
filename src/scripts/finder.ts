// The country finder and the header's two disclosures (Find and Menu).
//
// One module for three jobs, so the header and finder scripts stay small together:
// buildFinderData() shapes /data/finder.json at build time, matchCountries() ranks names,
// codes and aliases, and initShell() wires every [data-finder] on the page plus the
// header's details elements. Routes never live here: the profile base, the data address
// and every fallback link come from data attributes the components write at build time.

export interface FinderCountry {
  n: string; // name
  i: string; // ISO3, upper case
  p?: string; // coordination posture key, when recorded
  a?: string[]; // other names a visitor may type
}

export interface FinderData {
  /** posture key to [short label, colour]; colour is the posture colour, the only colour */
  p: Record<string, [string, string]>;
  /** label for a country with no posture recorded */
  none: string;
  c: FinderCountry[];
}

export interface FinderRow {
  iso3: string;
  name: string;
  posture: string | null | undefined;
}

/** Lower case, accents dropped, punctuation folded to spaces: "Côte d'Ivoire" to "cote divoire". */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Shapes the finder list at build time: sorted by name, aliases only where they add something. */
export function buildFinderData(
  rows: FinderRow[],
  aliases: Record<string, string[]>,
  postures: Record<string, { short: string; color: string }>,
  none: string,
): FinderData {
  const p: FinderData['p'] = {};
  for (const [k, v] of Object.entries(postures)) p[k] = [v.short, v.color];
  const c = rows
    .filter((r) => r.iso3 && r.name)
    .map((r) => {
      const iso3 = r.iso3.toUpperCase();
      const own = new Set([norm(r.name), norm(iso3)]);
      const extra = [...new Set((aliases[iso3] ?? []).filter((a) => !own.has(norm(a))))];
      const entry: FinderCountry = { n: r.name, i: iso3 };
      if (r.posture && p[r.posture]) entry.p = r.posture;
      if (extra.length) entry.a = extra;
      return entry;
    })
    .sort((x, y) => x.n.localeCompare(y.n, 'en'));
  return { p, none, c };
}

/** The most options the list shows at once; past it, a line asks the visitor to keep typing. */
export const CAP = 8;

/**
 * Matches in a fixed order of closeness: an exact name, code or alias; then a name that
 * starts with the query; an alias that starts with it; a word that starts with it; and,
 * from three letters, any name or alias containing it. Alphabetical within each step.
 */
export function matchCountries(list: FinderCountry[], query: string, limit = CAP): FinderCountry[] {
  const q = norm(query);
  if (!q) return [];
  const hits: [number, FinderCountry][] = [];
  for (const c of list) {
    let best = norm(c.i) === q ? 0 : 9;
    [c.n, ...(c.a ?? [])].forEach((name, k) => {
      const x = norm(name);
      const r =
        x === q ? 0 : x.startsWith(q) ? (k ? 2 : 1) : (' ' + x).includes(' ' + q) ? 3 : q.length > 2 && x.includes(q) ? 4 : 9;
      if (r < best) best = r;
    });
    if (best < 9) hits.push([best, c]);
  }
  return hits
    .sort((a, b) => a[0] - b[0] || a[1].n.localeCompare(b[1].n, 'en'))
    .slice(0, limit)
    .map((h) => h[1]);
}

// ---------------------------------------------------------------------------------------
// In the browser

let loading: Promise<FinderData> | null = null;
function load(src: string): Promise<FinderData> {
  loading ??= fetch(src)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<FinderData>;
    })
    .catch((e) => {
      loading = null; // a later focus or "Try again" retries
      throw e;
    });
  return loading;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

function initFinder(root: HTMLElement) {
  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const input = $<HTMLInputElement>('input');
  const list = $<HTMLElement>('[role=listbox]');
  const pop = $<HTMLElement>('.fd-pop');
  const empty = $<HTMLElement>('.fd-empty');
  const wait = $<HTMLElement>('.fd-wait');
  const err = $<HTMLElement>('.fd-err');
  const more = $<HTMLElement>('.fd-more');
  const status = $<HTMLElement>('.fd-status');
  if (!input || !list || !pop) return;
  const base = root.dataset.base ?? '';
  let data: FinderData | null = null;
  let items: FinderCountry[] = [];
  let active = -1;

  const go = (c: FinderCountry) => {
    window.location.href = base + c.i.toLowerCase();
  };

  const show = (on: boolean) => {
    pop.hidden = !on;
    input.setAttribute('aria-expanded', String(on && items.length > 0));
    if (!on) setActive(-1);
  };

  function setActive(k: number) {
    active = k;
    list.querySelectorAll('[role=option]').forEach((el, j) => el.setAttribute('aria-selected', String(j === k)));
    const el = k >= 0 ? (list.children[k] as HTMLElement | undefined) : undefined;
    if (el) {
      input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function render() {
    const q = input.value.trim();
    wait.hidden = !!data || !q;
    err.hidden = true;
    if (!data) {
      if (q) fetchData(); // typing loads the list too, in case the focus event never came
      return show(!!q);
    }
    const all = matchCountries(data.c, q, Infinity);
    items = all.slice(0, CAP);
    const d = data;
    list.innerHTML = items
      .map((c, k) => {
        const p = c.p ? d.p[c.p] : null;
        return `<li role="option" id="${input.id}-${k}" aria-selected="false"><span class="fd-dot${p ? '' : ' is-none'}"${p ? ` style="--c:${p[1]}"` : ''}></span><span class="fd-name">${esc(c.n)}</span><span class="fd-post">${esc(p ? p[0] : d.none)}</span></li>`;
      })
      .join('');
    empty.hidden = !q || items.length > 0;
    // more matches than the list shows: say so in the list and to screen readers
    const over = all.length > items.length;
    more.textContent = over ? `${items.length} of ${all.length} shown. Keep typing to narrow the list.` : '';
    more.hidden = !over;
    status.textContent = !q
      ? ''
      : over
        ? more.textContent
        : items.length
          ? `${items.length} ${items.length === 1 ? 'match' : 'matches'}`
          : empty.textContent ?? '';
    setActive(-1); // the rebuilt list reuses option ids, so no stale reference may survive
    show(!!q);
  }

  let pending = false;
  let goWhenReady = false; // Enter pressed before the list arrived
  function fetchData() {
    if (pending || data) return;
    pending = true;
    load(root.dataset.src ?? '').then(
      (d) => {
        pending = false;
        data = d;
        render();
        const now = goWhenReady;
        goWhenReady = false;
        if (now && items.length) go(items[0]);
      },
      () => {
        pending = false;
        goWhenReady = false; // a later load must never leave the page without a fresh Enter
        wait.hidden = true;
        err.hidden = false;
        show(true);
      },
    );
  }

  input.addEventListener('focus', () => {
    if (!data) fetchData();
    else if (input.value.trim()) render();
  });
  input.addEventListener('pointerdown', fetchData, { once: true });
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    const n = items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      if (pop.hidden) show(true);
      setActive(e.key === 'ArrowDown' ? (active + 1) % n : active <= 0 ? n - 1 : active - 1);
    } else if (e.key === 'Enter') {
      if (!input.value.trim()) return;
      e.preventDefault();
      if (n) go(items[Math.max(active, 0)]);
      else if (!data) {
        goWhenReady = true;
        fetchData();
      }
    } else if (e.key === 'Escape' && input.value) {
      // Escape clears; a second Escape on an empty field reaches the header and closes its panel
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      render();
    }
  });
  list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the field
  list.addEventListener('click', (e) => {
    const li = (e.target as Element).closest('[role=option]');
    if (li) go(items[[...list.children].indexOf(li)]);
  });
  list.addEventListener('mousemove', (e) => {
    const li = (e.target as Element).closest('[role=option]');
    const k = li ? [...list.children].indexOf(li) : -1;
    if (k >= 0 && k !== active) setActive(k);
  });
  root.querySelector('.fd-retry')?.addEventListener('click', () => {
    err.hidden = true;
    wait.hidden = false;
    input.focus();
    fetchData();
  });
  root.addEventListener('focusout', (e) => {
    if (!root.contains(e.relatedTarget as Node | null)) show(false);
  });
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Wires every finder on the page and the header's Find and Menu disclosures. */
export function initShell() {
  document.querySelectorAll<HTMLElement>('[data-finder]').forEach(initFinder);
  const pops = [...document.querySelectorAll<HTMLDetailsElement>('details[data-hd]')];
  const field = (d: Element | null) => d?.querySelector<HTMLInputElement>('[role=combobox]');

  pops.forEach((d) => {
    d.addEventListener('toggle', () => {
      if (d.open) pops.forEach((o) => o !== d && (o.open = false)); // one open at a time
    });
    // focus moving out closes the panel, so nothing focused is ever hidden under it;
    // a null target (a click on bare page, another window) is left to the click rule below
    d.addEventListener('focusout', (e) => {
      const to = e.relatedTarget as Node | null;
      if (d.open && to && !d.contains(to)) d.open = false;
    });
  });

  // Find opens and focuses its field in the same tap, so a phone raises its keyboard at once
  // (the toggle event comes too late for that). Without scripts the details opens natively.
  const find = pops.find((x) => x.dataset.hd === 'find');
  find?.querySelector('summary')?.addEventListener('click', (e) => {
    e.preventDefault();
    find.open = !find.open;
    if (find.open) field(find)?.focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const d = pops.find((x) => x.open);
      if (d) {
        d.open = false;
        d.querySelector('summary')?.focus();
      }
    } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) {
      const wide = field(document.querySelector('[data-finder=header]'));
      e.preventDefault();
      if (wide && wide.offsetParent) wide.focus();
      else if (find) {
        find.open = true;
        field(find)?.focus();
      }
    }
  });

  // a click outside an open panel, or on a link inside it, closes it
  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    pops.forEach((d) => {
      if (d.open && (!d.contains(t) || t.closest('a'))) d.open = false;
    });
  });
}
