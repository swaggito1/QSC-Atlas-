// The Documents page's script (spec 9). A plain script, not a React island: the page has to stay
// under 150 KB of HTML, and an island would carry its rows twice (once drawn, once as props). The build
// draws the first 50 rows as plain HTML; this script takes over from there:
//   - it reads the filters from the URL and writes them back. A choice adds a history entry; a
//     search adds one when it starts and then updates it while the visitor types; so a reload
//     restores the view and the back button restores the previous filter;
//   - it loads /data/documents.json the first time it needs more than the first 50 rows (a
//     filter, "Show 50 more" or a link to a row further down) and draws rows with the same
//     rowHtml() the build used;
//   - ?org= goes through the issuer alias table, which the build hands over in the page config;
//   - #doc-{id} scrolls to that row once it is drawn, and marks it.
// Every href (the JSON file, each profile) comes from the build in the page config; this file
// holds no route string. Without scripts the page keeps its first 50 rows and the two downloads.

import {
  NO_FILTERS,
  choiceChange,
  choiceCount,
  filterQuery,
  filterRows,
  fold,
  fromHistory,
  hasFilters,
  hashTarget,
  moreLabel,
  orgFits,
  readFilters,
  rowHtml,
  searchChange,
  statusText,
} from '../lib/site/documents';
import type { DocFilters, DocumentRow, DocumentsConfig, RowContext } from '../lib/site/documents';

type ChoiceKey = 'country' | 'org' | 'type' | 'tier' | 'year';
const CHOICES: ChoiceKey[] = ['country', 'org', 'type', 'tier', 'year'];

export function mountDocuments(root: HTMLElement): void {
  const configEl = root.querySelector<HTMLScriptElement>('script[data-dx-config]');
  const q = root.querySelector<HTMLInputElement>('#dx-q');
  const form = root.querySelector<HTMLFormElement>('.dx-controls');
  const table = root.querySelector<HTMLTableElement>('#dx-table');
  const tbody = table?.tBodies[0];
  const status = root.querySelector<HTMLElement>('#dx-status');
  if (!configEl || !q || !form || !table || !tbody || !status) return;

  const cfg = JSON.parse(configEl.textContent || '{}') as DocumentsConfig;
  const select = Object.fromEntries(CHOICES.map((k) => [k, root.querySelector<HTMLSelectElement>(`#dx-${k}`)])) as Record<
    ChoiceKey,
    HTMLSelectElement | null
  >;
  const live = root.querySelector<HTMLElement>('#dx-live');
  const clear = root.querySelector<HTMLButtonElement>('#dx-clear');
  const retry = root.querySelector<HTMLButtonElement>('#dx-retry');
  const more = root.querySelector<HTMLButtonElement>('#dx-more');
  const moreBox = root.querySelector<HTMLElement>('.dx-more');

  const ctx: RowContext = { places: cfg.places, notes: cfg.notes };
  const names: Record<string, string> = Object.fromEntries(Object.entries(cfg.places).map(([k, v]) => [k, v[0]]));

  let filters: DocFilters = readFilters(location.search);
  let rows: DocumentRow[] | null = null;
  let loading: Promise<DocumentRow[] | null> | null = null;
  let shown = cfg.pageSize;
  let drawn = false; // the rows on screen come from the data, not from the build
  let typing = false; // a search is under way: its next change updates the same history entry
  let liveTimer = 0;
  let searchTimer = 0; // the pause after a keystroke before the search runs

  // ---- state shown on the page ------------------------------------------------------------

  // the page's inline script hides the first rows while a filtered view loads, and shows them
  // again after a few seconds unless this script has started (data-live)
  root.setAttribute('data-live', '');
  const ready = () => root.removeAttribute('data-pending');

  const say = (text: string, empty = false) => {
    status.textContent = text;
    status.classList.toggle('is-empty', empty);
  };

  const announce = (text: string) => {
    if (!live) return;
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => {
      live.textContent = text;
    }, 700);
  };

  const chrome = () => {
    const n = choiceCount(filters);
    if (clear) {
      clear.hidden = !hasFilters(filters);
      // words alone are a search, not a filter: the button says what it clears
      clear.textContent = n === 0 && filters.q ? 'Clear search' : 'Clear filters';
    }
  };

  // ---- the controls -----------------------------------------------------------------------

  /** Selects a value, matching an option without regard to case; an unknown value is added as an option, so the control always shows what the URL asks for. */
  function setSelect(el: HTMLSelectElement | null, value: string, label = value): string {
    if (!el) return value;
    el.querySelectorAll('option[data-extra]').forEach((o) => o.remove());
    if (!value) {
      el.value = '';
      return '';
    }
    const hit = Array.from(el.options).find((o) => o.value && fold(o.value) === fold(value));
    if (hit) {
      el.value = hit.value;
      return hit.value;
    }
    const extra = new Option(label, value);
    extra.setAttribute('data-extra', '');
    el.add(extra);
    el.value = value;
    return value;
  }

  /** The issuers of the chosen country, or every issuer. */
  function fillIssuers() {
    const el = select.org;
    if (!el) return;
    const list = filters.country ? cfg.issuers.filter(([, codes]) => codes.includes(filters.country)) : cfg.issuers;
    el.replaceChildren(new Option('All issuers', ''), ...list.map(([name]) => new Option(name, name)));
  }

  /** Whether ?org= still finds anything in the chosen country, through its own name or an alias. */
  const fits = (org: string, country: string) => orgFits(org, country, cfg.issuers, cfg.aliases);

  /**
   * Puts the filters into the controls, and takes back each value as the control spells it. The
   * search field always shows the search the view holds (after Back, a cleared filter or a link
   * to a hidden row), except at the start, when words typed before this script ran are kept.
   */
  function syncControls(keepTyped = false) {
    if (!(keepTyped && document.activeElement === q && q!.value.trim())) q!.value = filters.q;
    fillIssuers();
    filters = {
      ...filters,
      country: setSelect(select.country, filters.country, names[filters.country] ?? filters.country),
      org: setSelect(select.org, filters.org),
      type: setSelect(select.type, filters.type),
      tier: setSelect(select.tier, filters.tier),
      year: setSelect(select.year, filters.year),
    };
    chrome();
  }

  // ---- history ----------------------------------------------------------------------------

  /** Writes the filters into the URL: a new history entry, or the current one updated while typing. */
  function commit(step: 'push' | 'replace') {
    const url = location.pathname + filterQuery(filters);
    if (step === 'push') history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  }

  // ---- data and drawing -------------------------------------------------------------------

  function load(): Promise<DocumentRow[] | null> {
    if (rows) return Promise.resolve(rows);
    if (!cfg.data) return Promise.resolve(null);
    if (!loading) {
      say('loading the documents');
      if (retry) retry.hidden = true;
      if (more) more.disabled = true;
      loading = fetch(cfg.data)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ documents: DocumentRow[] }>;
        })
        .then((body) => {
          rows = Array.isArray(body.documents) ? body.documents : [];
          return rows;
        })
        .catch(() => {
          loading = null;
          say('the documents could not be loaded.');
          if (retry) retry.hidden = false;
          return null;
        })
        .finally(() => {
          if (more) more.disabled = false;
        });
    }
    return loading;
  }

  function draw(all: DocumentRow[], speak: boolean) {
    const list = filterRows(all, filters, cfg.aliases);
    const visible = list.slice(0, shown);
    tbody!.innerHTML = visible.map((r) => rowHtml(r, ctx)).join('');
    drawn = true;
    table!.hidden = visible.length === 0;
    const remaining = list.length - visible.length;
    if (more) {
      more.hidden = remaining <= 0;
      more.textContent = moreLabel(remaining, cfg.pageSize);
    }
    if (moreBox) moreBox.hidden = remaining <= 0;
    const text = statusText(filters, { matched: list.length, shown: visible.length, total: all.length }, names, cfg.aliases);
    say(text, list.length === 0);
    if (speak) announce(text);
    ready();
  }

  const needsData = () => hasFilters(filters) || shown > cfg.pageSize || drawn;

  async function refresh(speak: boolean) {
    chrome();
    if (!needsData()) {
      ready();
      return;
    }
    const all = await load();
    if (all) draw(all, speak);
  }

  /** Scrolls to the row the hash names, drawing it first when it is further down or not loaded. */
  async function reveal() {
    root.querySelectorAll('.dx-row.is-target').forEach((el) => el.classList.remove('is-target'));
    const id = hashTarget(location.hash);
    if (!id) return;
    let el = document.getElementById(`doc-${id}`);
    if (!el || !root.contains(el)) {
      const all = await load();
      if (!all) return;
      let index = filterRows(all, filters, cfg.aliases).findIndex((r) => r.id === id);
      if (index === -1) {
        index = all.findIndex((r) => r.id === id);
        if (index === -1) {
          say('No document in the index has the address this link points to.', true);
          return;
        }
        // the filters hide the row the link asks for: show it, with no filters
        window.clearTimeout(searchTimer);
        filters = { ...NO_FILTERS };
        typing = false;
        syncControls();
        history.replaceState(null, '', location.pathname + location.hash);
      }
      shown = Math.max(shown, Math.ceil((index + 1) / cfg.pageSize) * cfg.pageSize);
      draw(all, false);
      el = document.getElementById(`doc-${id}`);
    }
    if (!el) return;
    el.classList.add('is-target');
    // at once, not with the page's smooth anchor scroll: a long glide past hundreds of rows is motion
    // the visitor did not ask for
    el.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  // ---- events -----------------------------------------------------------------------------

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    typing = false;
  });

  q.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      const change = searchChange({ filters, typing }, q.value);
      if (!change) return;
      ({ filters, typing } = change.next);
      commit(change.step);
      shown = cfg.pageSize;
      void refresh(true);
    }, 180);
  });
  q.addEventListener('blur', () => {
    typing = false;
  });

  for (const key of CHOICES) {
    select[key]?.addEventListener('change', () => {
      const change = choiceChange({ filters, typing }, key, select[key]!.value, fits);
      ({ filters, typing } = change.next);
      if (key === 'country') {
        fillIssuers();
        setSelect(select.org, filters.org);
      }
      commit(change.step);
      shown = cfg.pageSize;
      void refresh(true);
    });
  }

  clear?.addEventListener('click', () => {
    window.clearTimeout(searchTimer);
    filters = { ...NO_FILTERS };
    typing = false;
    syncControls();
    commit('push');
    shown = cfg.pageSize;
    q.focus();
    void refresh(true);
  });

  retry?.addEventListener('click', () => {
    void refresh(true).then(reveal);
  });

  more?.addEventListener('click', async () => {
    const before = tbody.rows.length;
    shown = Math.max(shown, before) + cfg.pageSize;
    const all = await load();
    if (!all) return;
    draw(all, true);
    // keyboard and screen reader users continue at the first new row
    tbody.rows[before]?.querySelector<HTMLElement>('a')?.focus();
  });

  window.addEventListener('popstate', () => {
    // a search still waiting to run would push a new entry and undo the Back
    window.clearTimeout(searchTimer);
    const back = fromHistory(location.search);
    ({ filters, typing } = back.next);
    q.value = back.field; // even while the field has focus: it must not keep words that no longer filter
    shown = cfg.pageSize;
    syncControls();
    void refresh(true).then(reveal);
  });
  window.addEventListener('hashchange', () => {
    void reveal();
  });

  // ---- start ------------------------------------------------------------------------------

  syncControls(true);
  void refresh(false).then(reveal);
}
