# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

This repo holds the Tita Media marketing site, exported from a Claude Design project ("Sitio Tita Media"). Each page is a standalone HTML file that boots its own React tree client-side — there is no build step, no bundler, and no package.json. All 6 pages (`index.html`, `strategy-advisory.html`, `ai-custom-solutions.html`, `commerce-solutions.html`, `retail-growth.html`, `cloud-data.html`) plus the shared components (`SiteHeader.dc.html`, `SiteFooter.dc.html`, `ContactForm.dc.html`) are implemented and cross-linked; internal routes resolve with no 404s.

Filenames are flat, lowercase, kebab-case slugs (SEO-clean URLs, no spaces or `&`) — this is deliberate, see "Flat structure, not folders" below. **Pages use a plain `.html` extension; the 3 shared components keep `.dc.html`** — that's not an inconsistency, see the extension note in that same section for why the components can't drop it.

Directory layout:
```
/                     the 6 pages + 3 shared dc-import components (must stay flat, see below)
/support.js           the dc-runtime — must stay at the repo root, NOT in /js/ (see below for why)
/js/                  every other *.js module: site-motion.js, faq-accordion.js, mount-graphic.js, and all lazy-loaded graphic modules
/images/              logo-tita-media.png, shopify-logo.webp, and the 4 platform-logo SVGs
/noticias/            GENERATED — one .html per blog post + paginated listing pages, see "Blog Noticias" below
/scripts/             generate-blog.mjs (+ .sh wrapper) — the one deliberate exception to "no build step", see "Blog Noticias" below
robots.txt, sitemap.xml   at the repo root (required location for both; sitemap.xml is also GENERATED, see "Blog Noticias")
```

**`support.js` must live at the repo root, not in `/js/` with everything else.** Every page's inline Component code is executed by `support.js` via `new Function(...)` (see `evalDcLogic` in `support.js`), not as a real `<script>`/module. A plain dynamic `import('./mount-graphic.js')` written inside that eval'd code resolves relative to **`support.js`'s own script location**, not the page's URL and not `document.baseURI` — that's a quirk of how browsers resolve dynamic-import specifiers for Function-constructor code. This was discovered the hard way: moving `support.js` into `/js/` (while every other module's `import()` call already said `./js/whatever.js`, correct if resolved against the *page*) made every one of those imports resolve to `/js/js/whatever.js` — a double prefix, 404 at runtime, React tree fails to mount the graphic. `fetch()`-based mechanisms (`dc-import`'s `COMPONENT_DIR`, `x-import`) are unaffected by this — only genuine `import()` calls inside eval'd Component code are. If `support.js` ever needs to move, every `import('./js/*.js')` call across all 9 pages would need to drop the `js/` prefix (since resolution would then already be relative to `/js/`) — don't move one without the other.

## Running locally

```bash
./dev.sh              # serves the directory on http://localhost:5173
PORT=8080 ./dev.sh     # custom port
```

`dev.sh` just wraps `python3 -m http.server` — no npm install required. **Pages must be served over HTTP, not opened via `file://`**: `support.js` does a dynamic `import()` and a `fetch(location.href)` at boot that both fail under `file://`.

There are no automated tests, lint, or build commands in this repo.

## How a page works

Despite the plain `.html` extension on the 6 top-level pages, they use the same "dc.html" template format internally (the extension is just a URL-facing rename; nothing about the format itself changed). Each page is self-contained:
1. `<script src="./support.js">` loads first — this is the **generated dc-runtime** (compiled from `dc-runtime/src/*.ts`, which lives outside this repo; the header comment says `// GENERATED ... do not edit — Rebuild with 'cd dc-runtime && bun run build'`). Never hand-edit `support.js`; ask for a rebuilt copy instead.
2. `support.js` loads React/ReactDOM/Babel from `unpkg` at runtime, parses the `<x-dc>...</x-dc>` template block in the page, and mounts it into `#dc-root`.
3. The page's own `<script type="text/x-dc" data-dc-script>` block defines a `class Component extends DCLogic { ... }` — this is the page's logic/state (mount hooks, event handlers referenced from the template via `onClick="{{ onSol }}"`-style bindings).
4. `data-props` on that script tag is a JSON schema (editor metadata: `motion`, `heroLayout`, `accent`, etc.) — these are the props Claude Design's editor UI would expose, not runtime config you need to touch.

Template mini-language inside `<x-dc>`: `sc-if`, `sc-for`, `dc-import` (mount another named DC component), `x-import` (load an external ES module and render one of its exports as a component). `{{ expr }}` interpolates against the component's render values.

## Flat structure, not folders

This applies to the **9 HTML/dc.html files only** (the 6 pages + 3 shared components) — they all live at the repo root, no subfolders. This is required, not just convention: the dc-runtime (`support.js`) resolves `dc-import` with `COMPONENT_DIR = "."` hardcoded (see `fetch(COMPONENT_DIR + "/" + encodeURIComponent(name) + ".dc.html")`), which fetches relative to the *current page's own URL*, not a fixed site root. If `SiteHeader.dc.html`/`SiteFooter.dc.html`/`ContactForm.dc.html` and the pages that `dc-import` them aren't siblings in the same directory, those imports 404 at runtime. Since `support.js` is generated (never hand-edit it), the only way to introduce real subfolders for these 9 files would be duplicating the 3 shared components into every folder — a sync hazard, not worth it for a 6-page site. If this ever needs to change, that constraint (not aesthetics) is what to solve first.

This constraint does **not** apply to the complementary image assets, or to JS modules *other than `support.js` itself* — `dc-import`'s hardcoded path only fires for `dc-import`-named components, never for `<script src>`, `import('./...')`, or `<img src>`, which are ordinary relative paths we write ourselves. That's why those live in `/js/` and `/images/` (see the directory layout above) — moving them just meant updating every reference from `./name.ext` to `./js/name.ext` or `./images/name.ext` across the 9 HTML/dc.html files. `support.js` is the one exception and stays at the repo root — see the callout above the directory layout for why.

The same hardcoded `+ ".dc.html"` suffix is why the 3 shared components can't be renamed to drop `.dc` the way the 6 top-level pages were: `dc-import name="SiteHeader"` always fetches `SiteHeader.dc.html` literally, no matter what you rename the file to, unless `support.js` itself is rebuilt (out of scope, lives outside this repo). The 6 top-level pages have no such constraint — they're reached only via `<a href>`, which we author ourselves, so their extension is just a naming choice.

## Two coexisting page architectures

- **`index.html`** is fully self-contained: its own inline header/nav/footer/contact-form markup and logic, no shared components.
- **The 5 other pages** (`strategy-advisory.html`, `ai-custom-solutions.html`, `commerce-solutions.html`, `retail-growth.html`, `cloud-data.html`) instead `dc-import` three shared components — `SiteHeader.dc.html`, `SiteFooter.dc.html`, `ContactForm.dc.html` (fetched at runtime as `./<name>.dc.html`) — and delegate all nav/scroll/reveal/cursor behavior to `site-motion.js`'s `initMotion(opts)` / `expandHandler(prefix)`, called from each page's own `start(tries)` polling method once `#tm-hdr` and `#tm-contacto` exist in the DOM. **Don't re-implement nav/dropdown/burger/Escape logic inside `SiteHeader.dc.html` or a single page** — `site-motion.js` already wires that globally for all 5 pages; adding it locally causes duplicate listeners.
- Known drift: `ContactForm.dc.html` uses an accent (`#2E8C52`) and background (`#fff`) that don't match the documented DESIGN.md tokens (`--tm-accent` `#80E593` / "Surface Quiet" `#F2F4F3`). Left as-is from the verbatim import — a deliberate scope choice, not an oversight.
- Both `index.html`'s own page-transition handler and `site-motion.js`'s shared one select outgoing links via `a[href$=".html"]` (plus `a[href="#"]`) to fade into `#tm-trans` before navigating. Any future internal link must end in `.html` (or be a `#anchor`) to get that transition — a link built with a different extension just navigates instantly, no error, easy to miss.

## SEO

- Every page's real, static `<head>` (before `<script src="./support.js">` runs) carries `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph, and Twitter Card tags, plus JSON-LD (`Organization`+`WebSite` on `index.html`, `BreadcrumbList` on each subpage). These are placed in the real `<head>`, not inside the page's `<helmet data-dc-atomics>` block — content in `<helmet>` is only appended into `document.head` by `support.js` after JS runs (see `createHelmetManager`/`compile` in `support.js`), so it wouldn't be present for anything that reads the raw HTML. The pre-existing `FAQPage` JSON-LD on `index.html` still lives inside `<helmet>` (untouched, not moved) — that's the one exception, kept as originally imported.
- `robots.txt` and `sitemap.xml` at the repo root assume production domain `https://titamedia.com` and list all 6 pages. Update both if the domain changes, and add new `<url>` entries to `sitemap.xml` (with a `<script type="application/ld+json">` `BreadcrumbList` + head meta on the new page itself) whenever a page is added.
- Canonical/OG/sitemap URLs for the home page point at the bare root `https://titamedia.com/`, not `.../index.html`. This works with no server rewrite needed: both `python3 -m http.server` locally and virtually every static host auto-serve `index.html` for a `/` request, so `index.html` is exactly why this could become the canonical root instead of needing a redirect. Internal `<a href>` links to home still say `index.html` (the real, relative filename) — only the fully-qualified SEO URLs (canonical, og:url, sitemap `<loc>`, breadcrumb `item`) use the bare root.

## Heavy visual modules are lazy-loaded, not bundled

The hero/solution graphics are separate ES modules, dynamically `import()`-ed at runtime by the page's inline `Component` logic (see the `mesh()`, `solar()`, `neural()`, and the per-solution accordion handler in `index.html`'s script block) via the shared `mountGraphic()` helper in `mount-graphic.js`. That helper re-mounts a graphic if its host node gets replaced and tears down the old instance first — don't bypass it with a raw `import()` + manual DOM append.

Because the `import()` only fires once the Component mounts, every page's real `<head>` also carries `<link rel="modulepreload">` for the three.js CDN build plus that page's own hero module(s), so the browser starts fetching them in parallel with everything else instead of waiting for React to mount first. Add the matching `modulepreload` line(s) whenever a page's hero graphic set changes.

Current modules and what they render, all using three.js loaded from a CDN URL (`unpkg`/`jsdelivr`, no local copy):
- `rhizome.js` / `solar-system.js` — the two alternate hero visualizations (draggable network vs. orbiting solar system), selected by the `heroLayout` prop.
- `mesh-gradient.js` — CSS-only background blob mesh (`initMeshGradient`) plus an unrelated `initEdgeGlow` helper for form borders.
- `neural-field.js` (SVG, no three.js) / `pause-field.js` (three.js) — the two alternate "pause" background textures, selected by the `pauseGraphic` prop.
- `sol-graphics.js` — the small inline diagrams inside the solutions accordion (`initCommerceGraphic`, `initRetailGraphic`, `initCloudGraphic`), keyed off which accordion row is open.
- `antena.js` (three.js) — the Wardenclyffe-style transmission tower (lattice structure, wire dome, electrical discharges, expanding emission rings, drag-to-rotate), the hero signature graphic for `noticias.html` specifically (root listing page only, not every paginated/category listing — see below). Pulled from the same Claude Design project as the rest of the site (`Noticias Hero.dc.html` + `antena.js`), not hand-written for this repo.

The 5 other pages each lazy-load their own set of graphic modules the same way: `card-beam.js` (Strategy & Advisory, AI & Custom Solutions, Commerce Solutions), `priority-field.js`/`priority-matrix.js` (Strategy & Advisory), `agent-sphere.js`/`agent-geo.js`/`agent-swarm.js` (AI & Custom Solutions, picked by a `kind` prop; `agent-geo.js` needs GSAP, loaded from CDN in that page's `<head>`), `commerce-ring.js`/`commerce-flow.js` (Commerce Solutions), `growth-vortex.js`/`growth-funnel.js` (Retail Growth), `cloud-waves.js`/`cloud-river.js`/`cloud-scale.js` (Cloud & Data). When adding a new page, check the script block's `import('./*.js')` calls rather than assuming a fixed set.

## Blog Noticias — generado desde WordPress

`noticias.html` (listing page 1), every `noticias/pagina-N.html` (listing pages 2+), every `noticias/<slug>.html` (one per post), and `sitemap.xml` are **generated by `scripts/generate-blog.mjs`** — do not hand-edit them, the same rule as `support.js`. Run it with `node scripts/generate-blog.mjs` (or `./scripts/generate-blog.sh`); Node ≥18, zero dependencies (uses built-in `fetch`/`fs`, no `npm install`, no `package.json`).

**Why generated instead of client-fetched.** An earlier version of `noticias.html` fetched `https://titamedia.com/wp-json/wp/v2/posts` live in the browser (CORS is open there) and only showed the latest 9 posts, linking out to the original WordPress post for the full read. The requirement became: the whole blog — every post, full reading experience — has to live on this site, with WordPress reduced to a pure data source ("que WP solo sea para cargarlos"). That has two consequences: (1) individual posts need their own real `<title>`/description/OG image to be indexable and shareable, which requires those tags to exist in the raw HTML, not be patched in by JS after a fetch resolves — hence generating a static file per post instead of a client-side single-page reader; (2) the listing is generated from the *same* script run as the posts (not fetched live from WP) so the two can never drift out of sync (WP publishing something new doesn't make it appear on the listing before its detail page exists). The deployed site never calls WordPress at runtime — confirmed via Playwright (zero requests to `titamedia.com/wp-json` after load).

**Why these pages don't use `dc-import`.** `dc-import` only works between siblings at the repo root (`COMPONENT_DIR = "."`, see "Flat structure, not folders"). With ~150+ generated files that would mean dumping all of them at the root — unworkable. So generated pages are **self-contained**, the same pattern `index.html` already uses (header/footer/contact form inlined, no `dc-import`), which is what lets them live inside `/noticias/`. They still reuse `site-motion.js` for nav/scroll-reveal behavior via `import('./js/site-motion.js')` — that dynamic `import()` resolves relative to `support.js`'s location (repo root) regardless of how deeply the calling page is nested, per the quirk documented above, so it needs no `../` adjustment. Anything that *isn't* a dynamic import inside eval'd Component code (`<script src>`, `<img src>`, `<a href>` to another top-level page) does need the normal relative-path adjustment, which the script handles via an `upBase` ('' at the root, `'../'` inside `/noticias/`).

**URL scheme:** `noticias.html` (root, page 1) → `noticias/pagina-2.html`, `pagina-3.html`, … (later listing pages) → `noticias/<wp-slug>.html` (one per post, flat, no further nesting). The script guards against a post slug ever colliding with the `pagina-\d+` pattern.

**Post body HTML.** `support.js`'s `{{ }}` template mini-language has no raw-HTML/`dangerouslySetInnerHTML` equivalent — it only interpolates escaped text (confirmed by reading `resolve()`/`walkText` in `support.js`). That's fine here because the post body isn't a reactive template binding: the script sanitizes WordPress's `content.rendered` (strips `<script>`, `on*` handlers, `javascript:` URLs) and pastes the result as literal HTML directly into the generated file, the same way any other static block of markup on this site is authored by hand.

**Publishing workflow:** publish/edit in WordPress → run `node scripts/generate-blog.mjs` → review the diff (`git status`/`git diff`) → commit → deploy. This is a manual step, not automated — if that becomes a problem (e.g. a scheduled job that runs the script and opens a PR), that's a separate, later piece of work.

## Adding another page from the Claude Design project

The source Claude Design project (id `b2e6f671-f14b-4844-b7e0-2c84e6ab69cd`) may still contain further pages not yet pulled in. Follow the same process used for the 5 pages above: fetch the page file (it'll come back as `<Page Title>.dc.html`) plus whatever JS modules and shared `dc-import` components its script block references. The page file itself goes at the repo root (flat, no subfolders — see "Flat structure, not folders" above); any new JS module goes in `/js/`, any new image asset in `/images/`. Rename the fetched page file to a lowercase kebab-case slug ending in plain `.html` (no spaces, no `&`, no `.dc`) before wiring up hrefs, point its `<script src>`/`import()`/`<img src>` at `./js/...` and `./images/...` to match the existing layout, update every page/component that links to it, and don't forget: `sitemap.xml` (new `<url>`), `robots.txt` (no change needed, `Allow: /` already covers it), and the new page's own `<head>` (title/description/canonical/OG/Twitter/BreadcrumbList JSON-LD — see "SEO" above).
