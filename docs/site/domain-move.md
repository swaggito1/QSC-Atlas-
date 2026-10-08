# Moving the Atlas to qscatlas.org

This is the plan for moving the QSC Atlas from https://qsc-atlas.vercel.app to https://qscatlas.org, in the order of section 15.2 of the structure specification. It is written for Swann. Every command is in a grey block with one line above it saying what it does. The results at the end say what has been checked, how, and on which day.

The move is reversible until visitors have followed the permanent redirect, so the order matters: the new domain must answer before the old address sends anyone to it.

## Where things stand on 1 October 2026

- The domain qscatlas.org is bought but not attached to the Vercel project. Claude has not changed any Vercel setting or DNS record, and does not deploy.
- `astro.config.mjs` still sets `site: 'https://qsc-atlas.vercel.app'`. Canonical tags, the sitemap, robots.txt, citations and sharing tags all follow that one line through `siteOrigin()` in `src/lib/site/config.ts`, so they still name the old address.
- `vercel.json` on the integration branch (`labs/tools`) holds the stage 0 redirects of section 15.1 and no rule for the old host. The routes test fails if a host rule appears before the move.
- `main`, which production deploys, has no `vercel.json`, so none of these redirects is live. On 1 October 2026 the old address answered `200` for `/`, `/who`, `/about/` and `/countries/deu?x=1`.
- From this Mac, https://qscatlas.org and https://www.qscatlas.org answered `502 Bad Gateway` through the sandbox's network proxy on 1 October 2026. Whether their DNS points anywhere is unconfirmed; only the Vercel dashboard's "Valid configuration" settles it.

## Who does what

| Step | Who | What |
|---|---|---|
| 0 | Swann pushes, or tells Claude to push; Claude runs the checks | Publish a preview of the new site and check the redirects on it |
| 1 | Swann | Merge stage 0 to `main` through a pull request; Vercel deploys it at the old address |
| 2 | Swann | Attach the domain in Vercel and create the DNS records at the registrar |
| 3 | Claude or Swann | Check that https://qscatlas.org serves the site |
| 4 | Claude prepares, Swann merges | The cutover commit on its own branch, merged only after step 3 |
| 5 | Claude | Check production: the old address redirects path for path, and every canonical tag names qscatlas.org |

## Before you paste anything

Paste each block into Terminal as it is. Every address is in single quotes because zsh, the Mac's shell, reads a bare `?` as a wildcard and stops with "no matches found".

## Step 0. Rehearse the redirects on a preview

Section 15.2 asks for a rehearsal on a preview before anything reaches production. This step needs Swann's go-ahead, because pushing publishes the branch.

Two checks come before the push. First, every wave of the build must be committed on `labs/tools`: a push publishes commits only, so anything left uncommitted would be missing from the preview, which would then rehearse an older build. List the uncommitted changes in the folders and files the site is built and checked from, leaving out the scraper routine's own files; it must print nothing. Drafts of your own elsewhere in the folder, such as a report or a figure, are not part of the site and are not listed. If it prints anything, stop and ask Claude.

```sh
git status --short -- src public data scripts .github docs/site labs/tools astro.config.mjs vercel.json vitest.config.mjs tsconfig.json package.json package-lock.json | grep -v -E ' (scripts/(ingest|query-plan|pqc-scan)\.mjs|scripts/lib/env\.mjs|scripts/routine-run\.sh|data/(candidates|results|routine)/|data/(coverage|dorks)\.json)'
```

Second, see what the push makes public for the first time. Count, folder by folder, the files on `labs/tools` that GitHub's `main` does not have; the `--` at the end tells git that `labs/tools` means the branch, not the folder of the same name. Read the list, and if anything in it should stay on this Mac, stop and tell Claude before pushing.

```sh
git diff --name-only --diff-filter=A origin/main labs/tools -- | cut -d/ -f1-2 | sort | uniq -c
```

Publish the integration branch on GitHub; Vercel then builds a preview deployment of it and production does not change. Pushing makes the branch's code public on GitHub; the files `.gitignore` lists stay on this Mac.

```sh
git push -u origin labs/tools
```

Copy the preview's address from the Vercel dashboard (the project's Deployments list), then store it in `P` so the next block can use it. Leave no slash at the end.

```sh
P='https://PASTE-THE-PREVIEW-ADDRESS-HERE'
```

Ask the preview for each old address and print only the status line and the address it redirects to, one per line. `curl -sI` fetches the response headers quietly, `grep` keeps the status and the `location`, and `tr` joins them on one line.

```sh
for path in '/who' '/about/' '/about' '/qsc-hero-prototype.html' '/qsc-strata-prototype.html' '/lab/cascade?sel=FRA' '/lab/anything' '/lab' '/lab/readiness' '/lab/exposure-clock' '/lab/rulebook' '/who?x=1' '/standards/cascade?sel=FRA'; do
  printf '%s  ' "$path"; curl -sI "$P$path" | grep -i -E '^(HTTP|location)' | tr -d '\r' | tr '\n' ' '; echo
done
```

What each line should show. The first five rows with "yes" are the acceptance test for this step.

| Address | Status | Location | Acceptance |
|---|---|---|---|
| `/who` | 308 | `/about#how-to-read` | yes |
| `/about/` | 308 | `/about` | yes |
| `/qsc-hero-prototype.html` and `/qsc-strata-prototype.html` | 308 | `/` | yes |
| `/lab/cascade?sel=FRA` | 307 | `/standards/cascade?sel=FRA`, with the query kept | yes |
| `/lab/anything` | 307 | `/` | yes |
| `/about` | 200 | none | `/about` itself must not loop |
| `/lab` | 308 | `/` | |
| `/lab/readiness`, `/lab/exposure-clock`, `/lab/rulebook` | 307 | `/prepare/check`, `/prepare/exposure`, `/prepare/eu-rules` | temporary until each tool is public |
| `/who?x=1` | 308 | write down exactly what comes back | shows where Vercel puts a query beside a fragment; not a gate |
| `/standards/cascade?sel=FRA` | 200 | none | the destination exists on a preview, where every tool is built |

Vercel may print a location with the preview's own address in front of the path; that is the same answer. If every line reads `401`, the preview is behind Vercel's login: open the addresses in a browser where you are signed in to Vercel and note the address each one ends on. If any acceptance row differs, stop there, do not merge stage 0, and paste the output to Claude.

Then one check in a browser, because curl shows where an address redirects but not the page a visitor then sees. Open the preview's address followed by `/lab/cascade?sel=FRA`. It should end on the Standards Cascade with France chosen: the Country select reads France, and the address bar still holds `sel=FRA` (the page writes its month, `t=`, beside it). If the select reads "None selected", the query was lost or not applied; note it in the results and tell Claude before merging.

### Optional: rehearse the old-host rule itself

The step 0 matrix cannot test the old-host rule, because that rule only answers on `qsc-atlas.vercel.app`. What it does with a query string is the one thing nothing has proved yet. It can be rehearsed on a throwaway branch that is never merged.

Make a throwaway branch from the integration branch.

```sh
git switch -c site/cutover-rehearsal labs/tools
```

Push it once, so Vercel gives the branch its own address (the one with `git` and the branch name in it); copy that address from the dashboard.

```sh
git push -u origin site/cutover-rehearsal
```

Claude then adds this rule at the top of `redirects` in `vercel.json`, with that address in place of the capitals, commits `vercel.json` alone and pushes again. It is a temporary redirect (307), so no browser keeps it.

```json
{ "source": "/:path*", "has": [{ "type": "host", "value": "PASTE-THE-BRANCH-ADDRESS-WITHOUT-HTTPS" }], "destination": "https://qsc-atlas.vercel.app/:path*", "permanent": false }
```

Ask the branch's address for a page with a query; the answer should be `307` with `location: https://qsc-atlas.vercel.app/countries/deu?x=1`. Then the same for the root, which should go to `https://qsc-atlas.vercel.app/`.

```sh
B='https://PASTE-THE-BRANCH-ADDRESS-HERE'
curl -sI "$B/countries/deu?x=1" | grep -i -E '^(HTTP|location)'
curl -sI "$B/" | grep -i -E '^(HTTP|location)'
```

Delete the throwaway branch on GitHub, then on this Mac. Nothing on it is kept; the routes test fails on that branch on purpose.

```sh
git push origin --delete site/cutover-rehearsal
git switch labs/tools && git branch -D site/cutover-rehearsal
```

## Step 1. Stage 0 goes live on the old address

Swann merges the integration branch to `main` once step 0 has passed (section 21.4), through a pull request on GitHub:

1. On the repository's page on GitHub, open a pull request from `labs/tools` to `main` (after the push, GitHub offers a "Compare & pull request" button).
2. Wait until the checks listed at the foot of the pull request, `lab-gate` and `site-check`, show as passed. If one fails, do not merge; paste its message to Claude.
3. Press Merge.

Vercel then deploys `main` to production at https://qsc-atlas.vercel.app, with every tool private and `site` unchanged.

Check that the stage 0 redirects are live in production: the answer should be `308` with `location: /about#how-to-read`.

```sh
curl -sI 'https://qsc-atlas.vercel.app/who' | grep -i -E '^(HTTP|location)'
```

## Step 2. Swann attaches the domain in Vercel

This step happens in the Vercel dashboard and at the registrar. Claude does not do it and does not change Vercel settings.

1. In the qsc-atlas project, open Settings, then Domains, and add `qscatlas.org` and `www.qscatlas.org`.
2. On the same page, set `www.qscatlas.org` to redirect to `qscatlas.org`, and choose 308 Permanent Redirect as its status code (the dialog offers several; step 3 expects a permanent one).
3. At the registrar where qscatlas.org was bought, first delete any A, AAAA, CNAME or ALIAS record the registrar created for `qscatlas.org` or `www` when the domain was bought (a parking page or a web forwarding). Leave MX and TXT records alone. Then create exactly the DNS records the dashboard shows for each domain, and no others.
4. Wait until both domains show "Valid configuration". DNS changes take time to spread, so a first check that fails is normal. If Vercel still shows "Invalid configuration" after a day, paste what the Domains page says to Claude.
5. Leave `qsc-atlas.vercel.app` attached. The old-host redirect answers on it, so it must stay.

## Step 3. Check that qscatlas.org serves the site

Ask the new domain for the home page and one profile; each should answer `200`.

```sh
curl -sI 'https://qscatlas.org/' | grep -i '^HTTP'
curl -sI 'https://qscatlas.org/countries/deu' | grep -i '^HTTP'
```

Ask the www address for a profile with a query; it should answer with a permanent redirect (308 or 301) to `https://qscatlas.org/countries/deu?x=1`. A `307` or `302` means the redirect in step 2 is temporary: change its status code to 308 in the same dialog and ask again.

```sh
curl -sI 'https://www.qscatlas.org/countries/deu?x=1' | grep -i -E '^(HTTP|location)'
```

Read the canonical tag the new domain serves. At this step it still names `https://qsc-atlas.vercel.app/countries/deu`, which is right: it proves the new domain serves the same build, and step 4 changes it.

```sh
curl -s 'https://qscatlas.org/countries/deu' | grep -o '<link rel="canonical" href="[^"]*"'
```

Then open https://qscatlas.org in a browser and check the padlock, which shows that the HTTPS certificate has been issued. Go on to step 4 only when all of this holds.

## Step 4. The cutover commit, on its own branch

One commit, on a branch of its own, changes two files and nothing else (three, if the routes test on `main` still needs the update described below). It is prepared as soon as stage 0 is live and merged only after Swann has confirmed that both domains show "Valid configuration" and step 3 has passed.

### The change

In `astro.config.mjs`, the one line:

```js
  site: 'https://qscatlas.org',
```

In `vercel.json`, the old-host rule first, before every other redirect, so an old address goes straight to the same path on the new domain:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "trailingSlash": false,
  "redirects": [
    { "source": "/:path*", "has": [{ "type": "host", "value": "qsc-atlas.vercel.app" }], "destination": "https://qscatlas.org/:path*", "permanent": true },
    { "source": "/who", "destination": "/about#how-to-read", "permanent": true },
    { "source": "/lab", "destination": "/", "permanent": true },
    { "source": "/lab/readiness", "destination": "/prepare/check", "permanent": false },
    { "source": "/lab/exposure-clock", "destination": "/prepare/exposure", "permanent": false },
    { "source": "/lab/cascade", "destination": "/standards/cascade", "permanent": false },
    { "source": "/lab/rulebook", "destination": "/prepare/eu-rules", "permanent": false },
    { "source": "/lab/:path*", "destination": "/", "permanent": false },
    { "source": "/qsc-hero-prototype.html", "destination": "/", "permanent": true },
    { "source": "/qsc-strata-prototype.html", "destination": "/", "permanent": true }
  ]
}
```

If a tool has gone public before the move, its `/lab` rule will already read `"permanent": true`; keep whatever the file holds on the day and only add the first rule.

Everything else follows from the one line in `astro.config.mjs`: canonical tags, sharing tags, the sitemap, robots.txt, citations, the documents download's source line, and the not-found page's sentence that old addresses redirect, which appears only once the origin has moved (`originMoved()` in `src/lib/site/config.ts` answers the same question for any page or test).

### The routes test

On 1 October 2026 the routes test in `src/lib/site/routes.test.ts` checks that `vercel.json` holds no host rule at all, so it fails as soon as the host rule goes in, and the pull request's checks would fail with it. Claude has asked the test's owner to make it check the host rule against `originMoved()` before the move: that version passes both before and after it. On the day, look at the test. If it already mentions `originMoved`, it needs nothing. If it still says "holds no host rule before the cutover", Claude makes two changes to that file in this commit. First, this line goes with the other imports at the top of the file:

```ts
import { PREVIOUS_HOST, originMoved, siteOrigin } from './config';
```

Second, the test that says "holds no host rule before the cutover" is replaced by this one:

```ts
it('keeps no trailing slash, and puts the old-host rule first exactly when the origin has moved', () => {
  expect(json.trailingSlash).toBe(false);
  const hostRules = rules.filter((r) => r.has);
  if (!originMoved()) {
    expect(hostRules).toEqual([]);
    return;
  }
  expect(hostRules).toHaveLength(1);
  expect(rules[0]).toEqual({
    source: '/:path*',
    has: [{ type: 'host', value: PREVIOUS_HOST }],
    destination: `${siteOrigin()}/:path*`,
    permanent: true,
  });
});
```

### The commands

Move to `main` and bring it up to date with GitHub, so the branch starts from the live code. The scraper routine keeps uncommitted files in this folder; if git refuses to switch because of local changes, stop and ask Claude, and never discard them.

```sh
git switch main && git pull
```

Create the branch `site/cutover` for this one change.

```sh
git switch -c site/cutover
```

After Claude has made the change above, run the validation, the tests and the style scan together; all three must pass.

```sh
npm run lab:check
```

Stage the files by name, so none of the scraper routine's uncommitted files goes into the commit. The routes test is in the list whether or not it changed; naming a file that has not changed stages nothing.

```sh
git add astro.config.mjs vercel.json src/lib/site/routes.test.ts
```

List what is staged. It must show `astro.config.mjs` and `vercel.json`, the routes test only if it changed, and nothing else; if anything else appears, stop and ask Claude.

```sh
git diff --cached --stat
```

Record the staged change as one commit on this branch.

```sh
git commit -m "qscatlas.org: canonical origin and the old-host redirect"
```

Publish the branch; Vercel builds a preview of it, and production does not change until the merge.

```sh
git push -u origin site/cutover
```

### Check the cutover preview before anyone merges

Store the cutover preview's address, from the Vercel dashboard, in `P`.

```sh
P='https://PASTE-THE-CUTOVER-PREVIEW-ADDRESS-HERE'
```

Read a profile's canonical tag on the preview; it should read `https://qscatlas.org/countries/deu`.

```sh
curl -s "$P/countries/deu" | grep -o '<link rel="canonical" href="[^"]*"'
```

Ask the preview for the same profile's headers; it should answer `200`, because the old-host rule only answers on `qsc-atlas.vercel.app`.

```sh
curl -sI "$P/countries/deu" | grep -i '^HTTP'
```

Read the preview's robots.txt; it should read `Disallow: /`, since a preview keeps crawlers out.

```sh
curl -s "$P/robots.txt"
```

Then open a pull request from `site/cutover` to `main` with "Do not merge until qscatlas.org and www.qscatlas.org show Valid configuration in Vercel and step 3 has passed" at the top of its description, and leave it unmerged. When both conditions hold and the pull request's checks, `lab-gate` and `site-check`, have passed, Swann presses Merge, and Vercel deploys `main` to production.

## Step 5. Check production after the move

Ask the old address for a profile with a query. This is the acceptance test: `308` with `location: https://qscatlas.org/countries/deu?x=1`.

```sh
curl -sI 'https://qsc-atlas.vercel.app/countries/deu?x=1' | grep -i -E '^(HTTP|location)'
```

Ask the old address for a spread of pages, path for path. Each should answer `308` to `https://qscatlas.org` followed by the same path and query. The root `/` must redirect too: the rule reaches the root only through the way Vercel matches an empty path, so this line proves it. `/who` and `/lab/cascade?sel=FRA` then take a second step on the new domain under their own rules, which is expected.

```sh
for path in '/' '/countries/deu?x=1' '/map' '/documents?x=1' '/methodology' '/about' '/who' '/lab/cascade?sel=FRA'; do
  printf '%s  ' "$path"; curl -sI "https://qsc-atlas.vercel.app$path" | grep -i -E '^(HTTP|location)' | tr -d '\r' | tr '\n' ' '; echo
done
```

Save every address the sitemap lists to a temporary file.

```sh
curl -s 'https://qscatlas.org/sitemap.xml' | grep -o '<loc>[^<]*' | cut -c6- > "$TMPDIR/atlas-urls.txt"
```

Count the sitemap addresses that are not on the new domain; it must print `0`.

```sh
grep -c -v '^https://qscatlas.org/' "$TMPDIR/atlas-urls.txt"
```

Fetch every page in the sitemap and print any whose canonical tag is missing or does not start with `https://qscatlas.org`; it must print nothing.

```sh
while read -r u; do c=$(curl -s "$u" | grep -o '<link rel="canonical" href="[^"]*"'); case "$c" in *'href="https://qscatlas.org'*) ;; *) echo "$u $c";; esac; done < "$TMPDIR/atlas-urls.txt"
```

Read robots.txt; its last line should be `Sitemap: https://qscatlas.org/sitemap.xml`.

```sh
curl -s 'https://qscatlas.org/robots.txt'
```

The Placeholder profiles carry noindex and are not in the sitemap, so the last checks do not reach them. To check every built page, Placeholder profiles and the not-found page included, build the site on this Mac from the JSON copy as production would, then list every built page whose canonical tag does not name the new domain; the second command must print nothing.

```sh
ATLAS_OFFLINE=1 VERCEL_ENV=production npm run build
grep -r -L 'rel="canonical" href="https://qscatlas.org' dist --include='*.html'
```

Finally, open https://qscatlas.org/no-such-page in a browser: the not-found page should now say that old qsc-atlas.vercel.app addresses redirect.

## If something goes wrong

Before the merge, nothing has changed in production. On GitHub, close the pull request and press "Delete branch".

After the merge, undo the cutover on `main`; Vercel then redeploys with the old origin and no old-host rule. The safest way is on GitHub: open the merged pull request, press "Revert", and GitHub opens a new pull request that undoes it; wait for its checks to pass, then merge it.

The same from Terminal, if the Revert button is not there. Move to `main` and bring it up to date with GitHub.

```sh
git switch main && git pull
```

Undo the merge. Replace the capitals with the id GitHub shows on the merged pull request after "merged commit"; `-m 1` keeps `main`'s side of a merge commit, and `--no-edit` keeps git's own message instead of opening an editor. If the pull request was merged with "Squash and merge" or "Rebase and merge", leave out `-m 1`.

```sh
git revert --no-edit -m 1 'PASTE-THE-MERGE-COMMIT-ID'
```

Publish the undo; Vercel deploys it to production.

```sh
git push
```

Once Vercel shows the new deployment as ready, ask the old address for a profile; it should answer `200` again, with no redirect.

```sh
curl -sI 'https://qsc-atlas.vercel.app/countries/deu' | grep -i -E '^(HTTP|location)'
```

A 308 is permanent, and browsers remember it. Anyone who has followed it keeps going to qscatlas.org even after a revert, so keep qscatlas.org attached and serving in Vercel whatever happens. Never remove the domain to undo the move.

## After the move

- Add the release row to `data/lab/shared/releases.json`, "The Atlas moved to qscatlas.org.", dated the day step 5 passed, with the step 5 check as its source. The file's own rule allows the row only once the domain serves the site.
- The old address still appears in `docs/REVIEWER_GUIDE.md`, `docs/DESIGN_HANDOFF.md`, the opening description in `CLAUDE.md`, and the line that introduces the Atlas in the three report scripts `docs/build_companion_report.py`, `docs/build_companion_report_v2.py` and `docs/build_engagement_plan.py`. Update them in a separate commit when convenient. Leave the old address where it is meant to stay: `PREVIOUS_HOST` in `src/lib/site/config.ts`, the host rule in `vercel.json`, the example in a comment in `src/lib/site/cite.ts`, the test inputs in `src/lib/site/documents.test.ts`, and this document.
- `labs/context/01-atlas-system.md` names the old address too, but it holds the scraper routine's uncommitted edits. Change the address there only after the routine's own edits have been committed, and never stage it together with other files.
- The GitHub repository's website field and the Zenodo record's links live in those services, so changing them is Swann's call.

To find every mention again, the first line lists the tracked files that name the old address, and the second also finds drafts in `docs/` that git does not track.

```sh
git grep -l 'qsc-atlas.vercel.app'
grep -rl 'qsc-atlas.vercel.app' docs
```

## Results

### Local rule check, 1 October 2026

This is not the preview run. Claude compiled `vercel.json` with the route compiler inside the Vercel command line tool installed on this Mac (version 54.12.2, the `getTransformedRoutes` function of Vercel's routing utilities) and walked each address through the compiled rules in order, matching each pattern the way Vercel's own development server does. It proves the order of the rules, the status codes and the path each address goes to. It cannot show what Vercel's servers do with a query string or a fragment; step 0 and the optional rehearsal are for that.

| Address | `vercel.json` today, any host | Prepared cutover, old host | Prepared cutover, qscatlas.org |
|---|---|---|---|
| `/who` | 308 to `/about#how-to-read` | 308 to `https://qscatlas.org/who`, then 308 to `/about#how-to-read` | 308 to `/about#how-to-read` |
| `/about/` | 308 to `/about` | 308 to `/about`, then 308 to `https://qscatlas.org/about` | 308 to `/about` |
| `/about` | served | 308 to `https://qscatlas.org/about` | served |
| `/qsc-hero-prototype.html` | 308 to `/` | 308 to `https://qscatlas.org/qsc-hero-prototype.html`, then 308 to `/` | 308 to `/` |
| `/qsc-strata-prototype.html` | 308 to `/` | 308 to the same path on qscatlas.org, then 308 to `/` | 308 to `/` |
| `/lab/cascade` | 307 to `/standards/cascade` | 308 to `https://qscatlas.org/lab/cascade`, then 307 to `/standards/cascade` | 307 to `/standards/cascade` |
| `/lab/readiness`, `/lab/exposure-clock`, `/lab/rulebook` | 307 to `/prepare/check`, `/prepare/exposure`, `/prepare/eu-rules` | 308 to the same path on qscatlas.org, then the same 307 | 307, as today |
| `/lab/anything`, `/lab/a/b` | 307 to `/` | 308 to the same path on qscatlas.org, then 307 to `/` | 307 to `/` |
| `/lab` | 308 to `/` | 308 to `https://qscatlas.org/lab`, then 308 to `/` | 308 to `/` |
| `/countries/deu` | served | 308 to `https://qscatlas.org/countries/deu` | served |
| `/countries/deu/` | 308 to `/countries/deu` | 308 to `/countries/deu`, then 308 to `https://qscatlas.org/countries/deu` | 308 to `/countries/deu` |
| `/` | served | 308 to `https://qscatlas.org/`, through the empty-path match | served |

On a preview address the prepared old-host rule never answers: `/countries/deu` is served and `/who` goes to `/about#how-to-read`, as today.

After the move, on the old address, a path with a trailing slash and every stage 0 redirect take two steps, because Vercel applies the trailing-slash rule before any redirect and the new domain then applies its own rule; visitors still arrive at the right page. The root `/` reaches the old-host rule only through the empty-path match, which is why step 5 checks it by name.

A second pass the same day ran the same compilation again and got the same table.

The routes test that checks the host rule against `originMoved()` (step 4) was run on 1 October 2026 against copies of the configuration, with the origin and `vercel.json` set each way: it passes with neither change made and with both, and fails when only one of the two is made, so the cutover commit cannot go out half done. The local build in `dist` of the same day carried a canonical tag on the current origin on every one of its 206 pages, so the last check of step 5, run after the move, has a baseline: the same pages with the new origin.

The same day Claude confirmed against the local development server, which shows every Atlas page as a preview does, that every destination answers `200` (`/`, `/about`, `/standards/cascade?sel=FRA`, `/prepare/check`, `/prepare/exposure`, `/prepare/eu-rules`), that `/about` carries the anchors `how-to-read` and `briefing`, and, with a copy of the configuration set to the new origin, that `siteOrigin()`, canonical addresses, the sitemap's addresses, sharing images, breadcrumbs and citations all switch to `https://qscatlas.org` from the one line.

### Preview run (step 0)

Not run. It needs Swann's go-ahead to push a preview. Every local screenshot taken with `?sel=FRA` while building showed the Cascade with no country chosen. The page's code reads `sel` from the address once it has loaded, so the screenshot tool probably captured before that happened, but that is not proven; only the browser check in step 0 settles it.

| Address | Status | Location | Checked on |
|---|---|---|---|
| `/who` | | | |
| `/about/` | | | |
| `/qsc-hero-prototype.html` | | | |
| `/qsc-strata-prototype.html` | | | |
| `/lab/cascade?sel=FRA` | | | |
| `/lab/anything` | | | |
| `/who?x=1` | | | |
| `/lab/cascade?sel=FRA` in a browser | | the page it ends on, and what the Country select reads | |

### The cutover branch (step 4)

Not created. The change is prepared above, ready to be made on `site/cutover` when Swann asks for it; it is not merged before he confirms that the domain shows "Valid configuration" in Vercel.

### Production checks (step 5)

Not run. The move has not happened.
