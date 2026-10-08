// QSC Atlas: the Readiness Check island, a guided self-assessment. The visitor may say which
// guides they follow (the EU roadmap and the NCSC timelines to start with) and whom they answer
// for, then answers one question per action, group by group: Done, In progress, Not started or
// Not applicable. A checklist view shows every question at once; the assessment, reachable at
// any time, sorts the visitor's own answers group by group and names up to three steps to take
// first, each with the earliest target date the chosen guides set for it.
//
// Answers stay in this page and in its address after the # sign, a part browsers keep to
// themselves; nothing is stored or sent. A link can say where to open: ?action= one question,
// ?theme= the first question of a group, ?start=entry the urgent adopter question, ?as= whom the
// visitor answers for, ?view= the checklist or the assessment. The query is read once on load
// and never written. Every address the island links to comes from the server as a prop, and only
// for pages this build makes.
//
// Source words: the island shows a source's own words only when the build carries them
// (sourceWordsAvailable) and the page was opened with ?review=1 (reviewRequested), checked after
// mounting so the server render and the first client render agree.
// No totals, scores, percentages or overall readings are computed anywhere, by design.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  ANSWERS,
  ROLES,
  decodeState,
  elementHref,
  encodeState,
  fillIn,
  firstOfGroup,
  firstUnanswered,
  groupSummaries,
  milestoneDue,
  nextSteps,
  positionIn,
  questionsFor,
  readLanding,
  readRole,
  readView,
  targetLine,
  toCsv,
  withSource,
} from '../../../../lib/lab/readiness';
import type { Answer, RdAction, RdDomain, RdElementLink, RdFramework, RdProvenance, Role } from '../../../../lib/lab/readiness';
import { formatDate } from '../../../../lib/lab/format';
import { reviewRequested } from '../../../../lib/site/review';

type View = 'one' | 'list' | 'assessment';

interface Props {
  copy: Record<string, any>;
  frameworks: RdFramework[];
  domains: RdDomain[];
  actions: RdAction[];
  defaults: string[];
  entryAction: string | null; // the question ?start=entry opens
  guides: Record<string, string>; // guide id to its page, for the pages this build makes
  elements: Record<string, RdElementLink[]>; // action id to the pages that do its job
  sourceWordsAvailable: boolean; // sourceWordsInBuild(), from the server
}

// the language of a source's words, by its host: only ANSSI publishes in another language here
const langOf = (url: string) => (url.includes('cyber.gouv.fr') ? 'fr' : undefined);

/** "a, b and c" */
function joinAnd(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Where a question's action is said: the document and its place in it, linked. No words of the source. */
function Where({ p, copy }: { p: RdProvenance; copy: Record<string, any> }) {
  const lang = langOf(p.url);
  return (
    <>
      <a href={p.url} rel="noopener">
        {p.title ? <span lang={lang}>{p.title}</span> : copy.sourceLink}
      </a>
      {p.locator ? `, ${p.locator}` : ''}
    </>
  );
}

export default function ReadinessTool({ copy, frameworks, domains, actions, defaults, entryAction, guides, elements, sourceWordsAvailable }: Props) {
  const [chosen, setChosen] = useState<string[]>(defaults);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<View>('one');
  const [at, setAt] = useState<string | null>(null); // the question on screen, by action id
  const [setupOpen, setSetupOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [live, setLive] = useState(false); // the island has read the address
  const [printedOn, setPrintedOn] = useState('');
  const [status, setStatus] = useState('');
  const [undo, setUndo] = useState<Record<string, Answer> | null>(null); // the answers "Clear answers" removed
  const [fallbackLink, setFallbackLink] = useState('');
  const [focusTick, setFocusTick] = useState(0);
  const focusTo = useRef<View | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);

  const known = useMemo(() => ({ frameworks: frameworks.map((f) => f.id), actions: actions.map((a) => a.id) }), [frameworks, actions]);
  const fw = useMemo(() => new Map(frameworks.map((f) => [f.id, f])), [frameworks]);
  const groupLabel = useMemo(() => new Map(domains.map((d) => [d.id, d.label])), [domains]);
  const questions = useMemo(() => questionsFor(actions, domains, chosen), [actions, domains, chosen]);

  const found = at ? questions.findIndex((q) => q.id === at) : -1;
  const index = found >= 0 ? found : 0;
  const current: RdAction | null = questions[index] ?? null;
  const pos = positionIn(questions, index);

  // move focus to the heading of what just opened, and bring it into view when it is not
  const focus = (v: View) => {
    focusTo.current = v;
    setFocusTick((t) => t + 1);
  };
  useEffect(() => {
    const v = focusTo.current;
    if (!v) return;
    focusTo.current = null;
    const head = document.getElementById(v === 'one' ? 'rd-q-h' : v === 'list' ? 'rd-list-h' : 'rd-asx-h');
    const box = document.getElementById(v === 'one' ? 'rd-q' : v === 'list' ? 'rd-list' : 'rd-asx');
    if (!head) return;
    head.focus({ preventScroll: true });
    const r = (box ?? head).getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.6) (box ?? head).scrollIntoView({ block: 'start' });
  }, [focusTick]);

  // after hydration: the guides, answers and role the address carries, then, read once, where the
  // link asks to open and whom it says the visitor answers for
  useEffect(() => {
    let state = null;
    try {
      state = decodeState(window.location.hash, known, defaults);
    } catch {
      // a fragment that cannot be read leaves the page as it opened
    }
    const search = window.location.search;
    let nextChosen = state?.chosen ?? defaults;
    const nextAnswers = state?.answers ?? {};
    const landing = readLanding(search, {
      domains: domains.map((d) => d.id),
      actions: actions.map((a) => ({ id: a.id, source: a.source })),
      entryAction,
    });
    // a question shows only with its guide chosen, so the guide joins the choice
    if (landing?.source) nextChosen = withSource(nextChosen, landing.source, known.frameworks);
    const qs = questionsFor(actions, domains, nextChosen);
    let nextAt: string | null = null;
    let nextView: View = 'one';
    const asked = readView(search);
    if (landing?.kind === 'action') nextAt = landing.id;
    else if (landing?.kind === 'group') nextAt = firstOfGroup(qs, landing.id)?.id ?? null;
    else if (asked) nextView = asked;
    else if (Object.keys(nextAnswers).length) {
      // a returning visitor opens on the first question still unanswered, or on the assessment
      const open = firstUnanswered(qs, nextAnswers);
      if (open) nextAt = open.id;
      else nextView = 'assessment';
    }
    setChosen(nextChosen);
    setAnswers(nextAnswers);
    setRole(readRole(search) ?? state?.role ?? null);
    setAt(nextAt);
    setView(nextView);
    setPrintedOn(formatDate(new Date().toISOString().slice(0, 10)));
    const showWords = sourceWordsAvailable && reviewRequested();
    setReview(showWords);
    if (showWords) document.documentElement.classList.add('is-review');
    if (landing) focus('one');
    else if (asked) focus(asked);
    setLive(true);

    const onHash = () => {
      try {
        const s = decodeState(window.location.hash, known, defaults);
        if (!s) return;
        setChosen(s.chosen);
        setAnswers(s.answers);
        setRole(s.role);
      } catch {
        // an address that cannot be read changes nothing
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // read once on load: the props never change after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the address in step with the answers, after the # sign only, without a new history entry
  useEffect(() => {
    if (!live) return;
    const enc = encodeState({ chosen, answers, role });
    const now = window.location.hash.replace(/^#/, '');
    const untouched = !role && Object.keys(answers).length === 0 && chosen.join(',') === defaults.join(',');
    if (now === enc || (untouched && !now)) return;
    try {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${enc}`);
    } catch {
      // a browser that refuses keeps the answers in the page alone
    }
  }, [live, chosen, answers, role, defaults]);

  // when the clipboard refuses, the link waits in the box below, selected and ready to copy
  useEffect(() => {
    if (fallbackLink && fallbackRef.current) {
      fallbackRef.current.focus();
      fallbackRef.current.select();
    }
  }, [fallbackLink]);

  const quiet = () => {
    setStatus('');
    setUndo(null);
  };

  const openQuestion = (id: string) => {
    setAt(id);
    setView('one');
    focus('one');
  };
  const openGroup = (group: string) => {
    const q = firstOfGroup(questions, group);
    if (q) openQuestion(q.id);
  };
  const openView = (v: View) => {
    setView(v);
    focus(v);
  };
  const go = (to: number) => {
    if (to < 0) return;
    if (to >= questions.length) return openView('assessment');
    openQuestion(questions[to].id);
  };

  const answer = (id: string, a: Answer | null) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (a) next[id] = a;
      else delete next[id];
      return next;
    });
    quiet();
  };

  const toggleSource = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : frameworks.map((f) => f.id).filter((x) => x === id || chosen.includes(x));
    // the question on screen stays, or gives way to the first of its group, or the first of all
    const qs = questionsFor(actions, domains, next);
    if (current) setAt(qs.some((q) => q.id === current.id) ? current.id : (firstOfGroup(qs, current.domain)?.id ?? qs[0]?.id ?? null));
    setChosen(next);
    quiet();
  };

  // Enter on a chosen answer moves on, as Next does
  const onAnswerKey = (e: KeyboardEvent<HTMLFieldSetElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault();
      go(index + 1);
    }
  };

  const shown = frameworks.filter((f) => chosen.includes(f.id));
  const guidesNow = shown.map((f) => f.shortLabel);
  const guidesSentence = joinAnd(shown.map((f) => `the ${f.shortLabel}`));
  const answerLabel = (a: Answer | undefined) => (a ? copy.answer[a] : copy.unanswered);
  const answered = questions.filter((q) => answers[q.id]).length;
  const steps = nextSteps(questions, answers, frameworks, chosen);
  const summaries = groupSummaries(questions, answers, domains);
  const nextQ = questions[index + 1];
  const nextLabel = !nextQ ? copy.toAssessment : current && nextQ.domain !== current.domain ? fillIn(copy.nextGroup, { group: groupLabel.get(nextQ.domain) ?? '' }) : copy.next;

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#${encodeState({ chosen, answers, role })}`;
    setUndo(null);
    try {
      await navigator.clipboard.writeText(url);
      setFallbackLink('');
      setStatus(copy.copied);
    } catch {
      setFallbackLink(url);
      setStatus(copy.copyFailed);
    }
  }

  function downloadCsv() {
    const header = String(copy.csvHeader).split(',');
    const rows = questions.map((a) => [
      a.label,
      groupLabel.get(a.domain) ?? a.domain,
      fw.get(a.source)?.shortLabel ?? a.source,
      targetLine(a, frameworks, chosen, copy),
      answerLabel(answers[a.id]),
      a.provenance[0]?.url ?? '',
      a.provenance[0]?.locator ?? '',
    ]);
    const blob = new Blob([toCsv([header, ...rows])], { type: 'text/csv;charset=utf-8' });
    const file = document.createElement('a');
    file.href = URL.createObjectURL(blob);
    file.download = 'readiness-check.csv';
    file.click();
    setTimeout(() => URL.revokeObjectURL(file.href), 10_000);
    setUndo(null);
    setStatus(copy.csvDone);
  }

  const clear = () => {
    if (Object.keys(answers).length) setUndo(answers);
    setAnswers({});
    setFallbackLink('');
    setStatus(copy.cleared);
  };
  const restore = () => {
    if (undo) setAnswers(undo);
    setUndo(null);
    setStatus(copy.restored);
  };

  const guideName = (f: RdFramework) =>
    guides[f.id] ? (
      <a className="rd-guide" href={guides[f.id]}>
        {f.shortLabel}
      </a>
    ) : (
      f.shortLabel
    );

  // ---- the question on screen ----
  const question = (q: RdAction) => {
    const f = fw.get(q.source)!;
    const els = elements[q.id] ?? [];
    const words = review ? q.provenance.filter((p) => p.excerpt) : [];
    return (
      <section className="rd-q" id="rd-q" aria-labelledby="rd-q-h">
        {pos && (
          <p className="rd-pos" id="rd-pos">
            {fillIn(copy.position, { group: groupLabel.get(pos.group) ?? pos.group, n: pos.n, count: pos.of })}
          </p>
        )}
        <h2 className="rd-q-h" id="rd-q-h" tabIndex={-1} aria-describedby="rd-pos">
          {q.label}
          {!q.verified && <span className="rd-lead">{copy.lead}</span>}
        </h2>
        {/* the guide a question comes from, by name: posture is answered elsewhere, so no dot */}
        <p className="rd-q-meta">
          <span className="rd-from">
            {copy.fromGuide} {guideName(f)}
          </span>
          <span className="rd-due">{targetLine(q, frameworks, chosen, copy)}</span>
        </p>
        <details className="rd-more lab-disclose" key={q.id}>
          <summary>{copy.more}</summary>
          <div className="rd-more-body">
            <p className="rd-desc">{q.description}</p>
            {q.audienceNote && <p className="rd-audience">{q.audienceNote}</p>}
            {els.length > 0 && (
              <ul className="rd-els">
                {els.map((l) => (
                  <li key={l.href}>
                    <a className="row-link" href={elementHref(l, chosen)}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {q.provenance.length > 0 && (
              <p className="rd-where">
                {copy.whereSaid}{' '}
                {q.provenance.map((p, i) => (
                  <span key={i}>
                    {i > 0 && '; '}
                    <Where p={p} copy={copy} />
                  </span>
                ))}
              </p>
            )}
            {words.length > 0 && (
              <div className="src-words rd-words">
                {words.map((p, i) => (
                  <blockquote key={i} cite={p.url} lang={langOf(p.url)}>
                    <p>{p.excerpt}</p>
                  </blockquote>
                ))}
                {words.some((p) => langOf(p.url)) && <p className="rd-fr">{copy.inFrench}</p>}
              </div>
            )}
          </div>
        </details>
        <fieldset className="rd-answers" onKeyDown={onAnswerKey}>
          <legend className="rd-sr">
            {copy.answerLegend}: {q.label}
          </legend>
          <div className="lab-choice lab-choice--boxed">
            {ANSWERS.map((a) => (
              <label key={a}>
                <input type="radio" name={`rd-a-${q.id}`} value={a} checked={answers[q.id] === a} onChange={() => answer(q.id, a)} />
                <span>{copy.answer[a]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="rd-step">
          <button type="button" className="lab-btn" onClick={() => go(index - 1)} disabled={index === 0}>
            {copy.back}
          </button>
          <button type="button" className="lab-btn lab-btn--primary" onClick={() => go(index + 1)}>
            {nextLabel}
          </button>
        </div>
      </section>
    );
  };

  const counts = (g: (typeof summaries)[number]) =>
    [...ANSWERS.map((a) => [g.byAnswer[a].length, copy.answer[a]] as const), [g.unanswered.length, copy.unanswered] as const]
      .filter(([n]) => n > 0)
      .map(([n, label]) => fillIn(copy.asxCount, { n, answer: String(label).toLowerCase() }));

  return (
    <div className="rd-tool" data-live={live ? '' : undefined} data-view={view}>
      {/* before you start: the guides followed and whom the visitor answers for, both optional */}
      <section className="rd-setup" aria-labelledby="rd-setup-h">
        <h2 id="rd-setup-h" className="rd-sr">
          {copy.setupHead}
        </h2>
        <div className="rd-guides-row">
          <p className="rd-guides-now" id="rd-guides-now">
            <span className="rd-k">{copy.guidesLabel}</span>{' '}
            <span className="rd-v">
              {guidesNow.length
                ? guidesNow.map((g, i) => (
                    <span key={g}>
                      <span className="rd-gn">
                        {g}
                        {i < guidesNow.length - 1 && <span className="dot-sep" aria-hidden="true" />}
                      </span>{' '}
                    </span>
                  ))
                : copy.guidesNone}
            </span>
          </p>
          <button
            type="button"
            className="share-btn rd-change"
            aria-expanded={setupOpen}
            aria-controls="rd-guides-panel"
            aria-label={setupOpen ? copy.guidesClose : copy.guidesChangeName}
            onClick={() => setSetupOpen((o) => !o)}
          >
            {setupOpen ? copy.guidesClose : copy.guidesChange}
          </button>
        </div>
        <div id="rd-guides-panel" className="rd-guides-panel" hidden={!setupOpen}>
          <fieldset className="rd-fs">
            <legend className="rd-legend">{copy.sourcesLegend}</legend>
            <div className="lab-choice rd-choice">
              {frameworks.map((f) => (
                <label key={f.id}>
                  <input type="checkbox" checked={chosen.includes(f.id)} onChange={() => toggleSource(f.id)} />
                  <span>{f.shortLabel}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="rd-hint">{copy.sourcesHint}</p>
          <details className="rd-about lab-disclose">
            <summary>{copy.aboutSummary}</summary>
            <ul>
              {frameworks.map((f) => (
                <li key={f.id}>
                  <span className="rd-about-name">{guideName(f)}</span>
                  <span className="rd-about-meta">
                    {fillIn(copy.sourceMeta, {
                      issuer: f.issuer,
                      status: f.published ? `${f.statusLabel} ${formatDate(f.published)}` : f.statusLabel,
                      bindingness: f.bindingnessLabel,
                      audience: f.audience,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
        <fieldset className="rd-fs rd-role">
          <legend className="rd-legend">
            {copy.roleLegend} <span className="rd-opt">({copy.roleOptional})</span>
          </legend>
          <div className="lab-choice">
            {ROLES.map((r) => (
              <label key={r}>
                <input type="radio" name="rd-role" value={r} checked={role === r} onChange={() => setRole(r)} />
                <span>{copy.role[r]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* the three ways to look at the same answers */}
      <ul className="lab-switch rd-views" aria-label={copy.viewsLabel}>
        {(
          [
            ['one', copy.viewOne],
            ['list', copy.viewList],
            ['assessment', copy.viewAssessment],
          ] as const
        ).map(([v, label]) => (
          <li key={v}>
            <button type="button" aria-pressed={view === v} onClick={() => openView(v)}>
              {label}
            </button>
          </li>
        ))}
      </ul>

      {view === 'one' && (current ? question(current) : <p className="rd-empty">{copy.noQuestions}</p>)}

      {/* the checklist: always in the page, on screen when chosen, so a link that opens it
          (?view=list) can draw it before the island takes over and nothing moves (lab-readiness.css) */}
      <section className="rd-list" id="rd-list" aria-labelledby="rd-list-h" data-on={view === 'list' ? '' : undefined}>
        <h2 className="rd-view-h" id="rd-list-h" tabIndex={-1}>
          {copy.listHead}
        </h2>
        {questions.length === 0 ? (
          <p className="rd-empty">{copy.noQuestions}</p>
        ) : (
          <>
            <p className="rd-hint">{copy.listIntro}</p>
            {summaries.map((g) => (
              <section key={g.id} className="rd-lg" aria-labelledby={`rd-lg-${g.id}`}>
                <h3 className="rd-lg-h" id={`rd-lg-${g.id}`}>
                  {g.label}
                </h3>
                <ul className="rd-rows">
                  {g.questions.map((q) => (
                    <li key={q.id} className="rd-row">
                      <button type="button" className="rd-row-q row-link" onClick={() => openQuestion(q.id)}>
                        {q.label}
                      </button>
                      <select
                        className="lab-select rd-row-a"
                        aria-label={`${copy.answerLegend}: ${q.label}`}
                        value={answers[q.id] ?? ''}
                        onChange={(e) => answer(q.id, (e.currentTarget.value || null) as Answer | null)}
                      >
                        <option value="">{copy.unanswered}</option>
                        {ANSWERS.map((a) => (
                          <option key={a} value={a}>
                            {copy.answer[a]}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </section>

      {/* the assessment: on screen when chosen, and always what the page prints */}
      <section className="rd-asx" id="rd-asx" aria-labelledby="rd-asx-h" data-on={view === 'assessment' ? '' : undefined}>
        <p className="rd-print-only rd-print-title">{copy.printTitle}</p>
        <h2 className="rd-view-h" id="rd-asx-h" tabIndex={-1}>
          {copy.asxHead}
        </h2>
        <p className="rd-asx-with">
          {role ? fillIn(copy.asxWithRole, { role: copy.roleIn[role], guides: guidesSentence || copy.guidesNone }) : fillIn(copy.asxWith, { guides: guidesSentence || copy.guidesNone })}
        </p>
        {answered === 0 ? (
          <p className="rd-empty">{copy.asxEmpty}</p>
        ) : (
          <>
            <section className="rd-first" aria-labelledby="rd-first-h">
              <h3 className="rd-asx-h3" id="rd-first-h">
                {copy.asxFirstHead}
              </h3>
              {steps.length > 0 ? (
                <ol className="rd-steps">
                  {steps.map((s) => (
                    <li key={s.action.id}>
                      <button type="button" className="rd-link row-link" onClick={() => openQuestion(s.action.id)}>
                        {s.action.label}
                      </button>
                      {/* each dot closes the item before it, so a wrapped line never starts on one */}
                      <span className="rd-step-meta">
                        <span className="rd-nw">
                          {answerLabel(s.answer)}
                          <span className="dot-sep" aria-hidden="true" />
                        </span>{' '}
                        <span className="rd-nw">
                          {groupLabel.get(s.action.domain)}
                          <span className="dot-sep" aria-hidden="true" />
                        </span>{' '}
                        <span className="rd-nw">
                          {s.target ? fillIn(copy.asxTarget, { when: milestoneDue(s.target.milestone), guide: s.target.framework.shortLabel }) : copy.asxNoTarget}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rd-empty">{copy.asxFirstNone}</p>
              )}
              <p className="rd-rule">{copy.asxFirstRule}</p>
              <p className="rd-targets">{copy.targetsNote}</p>
              {role && chosen.includes('eu-roadmap') && copy.asxEuFaq?.[role] && <p className="rd-faq">{copy.asxEuFaq[role]}</p>}
            </section>

            <section className="rd-bygroup" aria-labelledby="rd-bygroup-h">
              <h3 className="rd-asx-h3" id="rd-bygroup-h">
                {copy.asxGroupsHead}
              </h3>
              {summaries.map((g) => (
                <section key={g.id} className="rd-ag" aria-labelledby={`rd-ag-${g.id}`}>
                  <div className="rd-ag-head">
                    <h4 className="rd-ag-h" id={`rd-ag-${g.id}`}>
                      {g.label}
                    </h4>
                    <p className="rd-ag-counts">
                      {counts(g).map((c, i, all) => (
                        <span key={c}>
                          <span className="rd-nw">
                            {c}
                            {i < all.length - 1 && <span className="dot-sep" aria-hidden="true" />}
                          </span>{' '}
                        </span>
                      ))}
                    </p>
                  </div>
                  <dl className="rd-ag-dl">
                    {[...ANSWERS.map((a) => [a, g.byAnswer[a]] as const), ['unanswered', g.unanswered] as const]
                      .filter(([, list]) => list.length > 0)
                      .map(([a, list]) => (
                        <div key={a} className={`rd-ag-row rd-ag-row--${a}`}>
                          <dt>{a === 'unanswered' ? copy.unanswered : copy.answer[a]}</dt>
                          <dd>
                            <ul>
                              {list.map((q) => (
                                <li key={q.id}>
                                  <button type="button" className="rd-link row-link" onClick={() => openQuestion(q.id)}>
                                    {q.label}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ))}
            </section>
          </>
        )}
        {printedOn && live && <p className="rd-print-only rd-print-from">{fillIn(copy.printFrom, { url: `${window.location.origin}${window.location.pathname}`, date: printedOn })}</p>}
      </section>

      {/* every group, to jump to; the counts are of the visitor's own answers, inside each group */}
      <nav className="rd-groups" aria-label={copy.groupsNav}>
        <p className="section-label rd-groups-h" aria-hidden="true">
          {copy.groupsNav}
        </p>
        <ul>
          {domains.map((d) => {
            const qs = questions.filter((q) => q.domain === d.id);
            const n = qs.filter((q) => answers[q.id]).length;
            const here = view === 'one' && current?.domain === d.id;
            return (
              <li key={d.id}>
                <button type="button" className="rd-gbtn" aria-current={here ? 'step' : undefined} disabled={qs.length === 0} onClick={() => openGroup(d.id)}>
                  <span className="rd-gname">{d.label}</span>
                  <span className="rd-gcount">{qs.length ? fillIn(copy.groupCount, { n, count: qs.length }) : copy.groupNone}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="rd-actbar">
        <p className="rd-privacy">{copy.privacy}</p>
        {/* each dot travels with the button after it, so a wrapped line never ends on a dot */}
        <div className="share-bar">
          <button type="button" className="share-btn" onClick={copyLink}>
            {copy.copyLink}
          </button>
          <span className="rd-act">
            <span className="dot-sep" aria-hidden="true" />
            <button type="button" className="share-btn" onClick={downloadCsv}>
              {copy.downloadCsv}
            </button>
          </span>
          <span className="rd-act">
            <span className="dot-sep" aria-hidden="true" />
            <button type="button" className="share-btn" onClick={() => window.print()}>
              {copy.print}
            </button>
          </span>
          <span className="rd-act">
            <span className="dot-sep" aria-hidden="true" />
            <button type="button" className="share-btn" onClick={clear}>
              {copy.clear}
            </button>
          </span>
          <p className="share-status" aria-live="polite">
            {status}
            {undo && (
              <>
                {' '}
                <button type="button" className="rd-undo" onClick={restore}>
                  {copy.undo}
                </button>
              </>
            )}
          </p>
        </div>
        {fallbackLink && (
          <input
            ref={fallbackRef}
            className="lab-select rd-fallback"
            type="text"
            readOnly
            value={fallbackLink}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={copy.copyLink}
          />
        )}
      </div>
    </div>
  );
}
