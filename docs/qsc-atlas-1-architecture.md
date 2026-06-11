# QSC Atlas — system architecture and data flow

This is the reference document for how the platform works as a system. It is not a build brief and not a design brief. It explains the moving parts, how they communicate, and what happens when something changes. Read this first, then the backend brief and the design brief make sense in context. Both Claude Code and Claude Design should read this so they share one mental model.

## the system in one paragraph

The QSC Atlas is a static website. Your content lives in Notion. A build tool called Astro reads that content from Notion, turns it into finished web pages, and the result is hosted on Vercel at a public address. Your source code lives on GitHub. The site is pre-built, not live: visitors are served finished pages, and nothing talks to Notion while a visitor is browsing. Because of that, the site only changes when it is rebuilt. A rebuild happens automatically when you change the code, and on demand when you change the content. A scheduled Cowork task sits to one side, adding new source documents into Notion and triggering rebuilds for low-risk updates.

## data flow diagram

```
                       ┌────────────────────────────────────────────┐
                       │                  NOTION                      │
                       │        (you edit content here)               │
                       │                                              │
                       │  ATLAS_COUNTRIES   ATLAS_BLOG   ATLAS_DOCS   │
                       └─────────▲──────────────────────────┬─────────┘
                                 │                           │
            build-time read      │ HTTPS, token-auth,        │ write rows
            Astro fetches all    │ read only                 │ via Notion API
            rows during a build  │                           │ (Cowork credentials)
                                 │                           │
        ┌────────────────────────┴───────┐            ┌──────┴────────────────┐
        │            VERCEL               │            │   COWORK ROUTINE       │
        │                                 │            │   scheduled task       │
        │  runs the Astro build,          │            │   scrape institutional │
        │  fetches Notion, renders the    │            │   sources, write doc   │
        │  static site, hosts it          │◄───────────┤   rows, fire deploy    │
        │                                 │  deploy    │   hook for low-risk     │
        │  public URL: atlas.<domain>     │  hook POST │   only                  │
        └───────────────▲─────────────────┘            └────────────────────────┘
                        │
        auto build on   │ push to the main branch
        every push      │ triggers a build and deploy
                        │
              ┌─────────┴──────────┐
              │       GITHUB        │
              │  source code only   │
              │  no token, no data  │
              └─────────▲───────────┘
                        │
        git push        │ Claude Code commits your code
                        │
              ┌─────────┴───────────┐
              │    YOUR MACHINE      │
              │  Claude Code builds, │
              │  edits, commits      │
              │  local .env holds    │
              │  NOTION_TOKEN        │
              └──────────────────────┘
```

## the four relationships, explained

### 1. Astro reads Notion at build time

This is the concept that makes everything else fall into place. Astro is a static site generator. When it builds, it runs Node code on a machine (your laptop during development, Vercel's servers in production). That code calls the Notion API over HTTPS, authenticated with an integration token, and pulls every row from the three databases. Astro then transforms those rows into typed content and renders finished HTML, CSS, and a small amount of JavaScript.

The output is a folder of static files. That is what gets served to visitors. There is no database connection open while someone browses the site, and the Notion token is never shipped to the browser. This makes the site fast, cheap to host, and hard to attack, because there is no live backend to compromise. The trade is the one constraint you have to keep in mind throughout: the site reflects Notion as it was at the last build, not as it is right now. New content in Notion is invisible to the public until the next rebuild.

### 2. GitHub holds the code, Vercel watches GitHub

GitHub stores the source code and nothing else. No Notion token, no content data, just the project files. Vercel is connected to that GitHub repository. Every time code is pushed to the main branch, Vercel notices, pulls the latest code, runs the Astro build (which re-fetches Notion), and deploys the result to the live URL. This is continuous deployment. In practice it means: Claude Code makes a change and commits it, the commit goes to GitHub, and a minute or two later the live site reflects the change without you doing anything else.

### 3. Notion reaches the live site through a deploy hook

Here is the part people miss. Editing Notion does not push anything to GitHub, so a Notion edit does not trigger a Vercel build on its own. If you change a country profile and do nothing else, the public site stays exactly as it was. To push content changes live you fire a Vercel deploy hook. A deploy hook is a single secret URL that Vercel gives you; sending a POST request to it starts a fresh build and deploy with no code change involved. That fresh build re-fetches Notion, picks up your edits, and redeploys.

You fire the hook in one of two ways. Manually, by saving the hook URL as a browser bookmark or a one-button shortcut and clicking it after you finish editing in Notion. Or automatically, by having the Cowork routine fire it after it publishes a low-risk row. Either way, the rule to hold in your head is simple: edit Notion, then trigger a rebuild, then the public site updates.

### 4. Secrets live in two places, never in the code

The Notion integration token and the three database IDs are configuration, not code. They live in two places. On your machine, in a local `.env` file that is listed in `.gitignore` so it never reaches GitHub. On Vercel, in the project's environment variable settings, so the production build can read them. The token itself is created once inside Notion's own settings (Settings, Connections, develop or manage integrations), and each of the three databases must be explicitly shared with that integration or the build cannot read them. This is the one piece of setup no tool can do for you, because it is tied to your Notion account.

## the Cowork routine's place in the system

The Cowork routine is a scheduled task that runs outside the site. On its schedule it scrapes institutional sources for new or changed QSC documents, and writes them as rows into ATLAS_DOCUMENTS using the Notion API with its own credentials. It also drafts a short change-note into ATLAS_BLOG. For genuinely low-risk updates, defined by concrete rules in the backend brief rather than by the routine's own judgement, it sets the row to published and fires the Vercel deploy hook so the site rebuilds. For anything else it leaves the entry as a draft for you to review. The routine never edits country profile fields automatically. It is an input to Notion and an occasional trigger of rebuilds, nothing more. The site neither knows nor cares that Cowork exists; it simply rebuilds when the hook is fired, the same as if you had clicked it yourself.

## the two update paths, walked end to end

A code or design change. You ask Claude Code or Claude Design for a change. Claude Code commits it and pushes to GitHub. Vercel sees the push, rebuilds (re-fetching Notion in the process), and deploys. The live site updates. You did nothing after approving the change.

A content change. You edit a country, a document, or a blog post in Notion. Nothing happens to the public site yet. You fire the deploy hook, by bookmark or via the Cowork routine. Vercel rebuilds, re-fetches Notion, picks up your edit, and deploys. The live site updates.

## what this means in practice

Speed and cost. Static hosting on Vercel is fast for visitors anywhere and free or near-free at the Atlas's likely traffic. Builds take a small number of minutes.

Security. No live database connection is exposed, and the Notion token never reaches the browser. The main thing you must protect is the token itself and the deploy hook URL, both of which are secrets.

The one limitation to design around. The site is only as current as its last build. This is fine for a research instrument that changes in steps rather than continuously, and the deploy hook plus the Cowork routine together keep the gap between editing and publishing as small as you want it. It does mean there is no real time anything; if you need a profile change live, you edit Notion and fire a rebuild, you do not expect it to appear instantly on its own.

## glossary

Static site generator: a tool that builds finished web pages ahead of time rather than generating them on each visit. Astro is ours.

Headless CMS: a content store with no front end of its own, read by something else. Notion is playing this role.

Content collection: Astro's typed, structured representation of a set of content, one per Notion database in our case.

Continuous deployment: the GitHub-to-Vercel arrangement where pushing code automatically builds and publishes the site.

Deploy hook: a secret URL that triggers a Vercel rebuild when sent a POST request, used to publish Notion content changes.

Environment variable: a named secret or setting read by the build, kept out of the code. Our Notion token and database IDs are environment variables.

Island: an interactive component (the map, the document search) that runs JavaScript in the browser while the rest of the page stays static.
