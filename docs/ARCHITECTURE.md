# Architecture

Pecking Order is a static single-page app. There is no server-side state at all:
Cloudflare Pages serves files, and one small middleware handles two routing
details. Everything a user creates lives in their browser.

This document explains how the pieces fit and, more usefully, why they are the
way they are. Most choices came from studying the open-source tier list makers
that came before and the bugs their users kept reporting.

## Layers

```text
 ┌────────────────────────────────────────────────────────────────────┐
 │ src/ui        React components, dialogs, home page, router          │
 │               ↓ calls shared actions (src/ui/actions.ts, start.ts)  │
 ├────────────────────────────────────────────────────────────────────┤
 │ src/state     boardStore (board, undo history, saving)              │
 │               uiStore (preferences, dialogs, toasts, selection)     │
 ├────────────────────────────────────────────────────────────────────┤
 │ src/core      pure domain: op* functions, Peck-off, validation      │
 ├───────────────┬───────────────┬──────────────┬─────────────────────┤
 │ src/storage   │ src/images    │ src/export   │ src/packs           │
 │ IndexedDB,    │ ingest, worker│ canvas PNG   │ catalog, resolver,  │
 │ .peck files   │ search sources│ renderer     │ installer           │
 └───────────────┴───────────────┴──────────────┴─────────────────────┘
```

Arrows only point down. `src/core` imports nothing from the other layers, which
is what makes it trivially testable.

## The board model

A board (`src/core/types.ts`) is plain, serialisable data:

- `tiers`: ordered list of `{ id, label, color }`
- `items`: a record of `{ id, label, image?, credit? }` keyed by id
- `placement`: for each container (every tier plus the special `coop`), the
  ordered list of item ids in it

Keeping placement separate from items makes moves cheap (splice two arrays),
keeps the item data stable while it travels, and gives a simple invariant that
`assertValidBoard` checks: every item is placed exactly once.

Every edit is an `op*` function in `src/core/board.ts` that mutates a draft.
`boardStore.apply(op)` runs it inside Immer's `produce`, so the result is a new
immutable board that shares structure with the old one. The previous board goes
onto a bounded history stack, and undo is just swapping snapshots.

## Dragging

The board uses `@dnd-kit/core` with `@dnd-kit/sortable`:

- **`rectSortingStrategy`** treats each tier as a wrapping grid. List-based
  sorting strategies are the reason several popular tier makers can't drop items
  onto the second line of a full tier.
- **Collision detection** is pointer first: find the container under the
  pointer, then the closest item inside it, and remember the last target so the
  item doesn't flicker while the layout shifts.
- **Gestures**: `beginGesture()` snapshots the board, cross-container moves are
  applied live during the drag without touching history, and `endGesture()`
  records exactly one undo step (or restores the snapshot on cancel).
- **Feel**: the drag overlay is a Motion component whose rotation follows a
  spring on the pointer's horizontal velocity; the vacated slot becomes a dashed
  egg; a CSS "peck" squash plays where the item lands. All of it switches off
  under `prefers-reduced-motion`.
- **Alternatives to dragging**: dnd-kit's keyboard sensor with spoken
  announcements, number keys that send the focused item straight to a tier, and
  tap-to-place for touch screens. While a drag is in progress the Coop dock
  shrinks to one row so every tier stays reachable.

File drops from the operating system use native HTML5 drag events on the
window, while item drags use pointer events, so the two never interfere.

## Images

`src/images` turns anything the user offers into a stored picture:

1. **Collect**: files, folders (walking `webkitGetAsEntry` until `readEntries`
   returns nothing), clipboard items, `text/uri-list`, `<img>` tags inside pasted
   HTML (parsed with an inert `DOMParser`, never inserted), or plain text lines
   that become text-only tiles.
2. **Process** in a module worker with `OffscreenCanvas`: decode, downscale to at
   most 480px, encode WebP (falling back to JPEG or PNG where a browser, like
   Safari, can't encode WebP), and hash the output with SHA-256. SVGs are
   rasterised and never stored as SVG.
3. **Store** the Blob in IndexedDB keyed by its hash. Identical pictures are
   stored once, and a garbage collector removes images no board references.

Because every picture is a local Blob before it is ever drawn, the export canvas
can never be tainted by a cross-origin image, which is the most common export
bug in other tier list makers.

Search sources (`src/images/sources`) query Wikipedia, Wikimedia Commons and
Openverse straight from the browser. All three send permissive CORS headers, so
no proxy is needed, and every result keeps its author, licence and source link.

## Templates (packs)

A pack is `packs/<id>/pack.json`. At build time `scripts/build-packs.mjs`
validates every pack, writes a small catalog that ships in the app bundle, copies
each full pack to `public/packs/<id>.json` for on-demand loading, and copies the
committed `cover.webp` mosaic next to it. Installing a pack resolves each item's
picture (Wikipedia lead image, Commons file, or allow-listed URL), downloads it
through the same ingest pipeline, and builds a board. An item whose picture fails
becomes a text tile instead of failing the whole pack.

Covers are rendered once by contributors (`npm run packs:covers`) and served from
our own origin, so the home page makes no third-party requests.

## Export

`src/export/layout.ts` is a pure function from board and options to positioned
rectangles and fitted text; `render.ts` draws that layout on a Canvas 2D. It
waits for the web fonts, centre-crops images by hand (canvas has no
`object-fit`), caps the pixel area at iOS's canvas limit, and adds a seeded paper
grain so output is deterministic. Drawing from data instead of screenshotting the
DOM means crisp output on Safari and no surprises from modern CSS.

## Storage and backups

IndexedDB (through `idb`) holds three stores: `boards`, `images` and `meta`.
Saving is a debounced write-behind after every change, plus a flush on
`pagehide`. The app asks for persistent storage so Safari's seven-day eviction
doesn't eat people's work.

`.peck` files are zips (via `fflate`, loaded lazily) holding the board JSON and
its images. Imports are treated as hostile: entry count and size limits are
checked before inflating, only expected entry names are extracted, each image's
bytes must hash to its name and sniff as a raster format, and the board goes
through the same validator as everything else.

## Routing and hosting

A tiny History API router (`src/ui/router.tsx`) maps `/` to the home page and
`/b/<id>` to a board. The board page is lazy loaded, so the home page doesn't pay
for drag and drop.

On Cloudflare Pages, `functions/_middleware.ts`:

- serves the app shell for `/b/<id>` (with `X-Robots-Tag: noindex`), because
  Pages doesn't apply `_redirects` to requests a Function handles;
- serves Markdown twins of the static pages to clients that ask for
  `text/markdown`, which helps AI agents read the site;
- leaves everything else to static hosting, where `public/_headers` applies a
  strict Content Security Policy and the usual hardening headers.

Real unknown paths return a real 404.

## Agents

`src/agent/webmcp.ts` registers WebMCP tools (`new_board`, `get_board`,
`add_items`, `move_item`, `set_title`, `add_tier`, `open_export`) when the
browser supports `document.modelContext`. They call the same undoable actions as
the UI, so anything an agent does is visible and reversible. `public/llms.txt`
and the Markdown twins describe the site for agents that only read.

## Performance budget

- Home page: about 106 KB of gzipped JavaScript. The board page, Motion's
  animation features, dialogs, the zip library and the export renderer all load
  on demand.
- Icons are generated into `src/ui/icons.tsx` with only the glyphs and weights in
  use, instead of shipping six weights of every icon.
- Fonts are self-hosted variable fonts (Fraunces and Instrument Sans).

## Testing

- **Unit** (Vitest): the domain, store, storage, ingest parsing, search
  mapping, export layout, pack validation, middleware routing and router.
- **End to end** (Playwright): static pages, the app shell, keyboard flows and
  axe accessibility checks in light and dark themes.
- **Style guards**: a test fails if an em dash appears anywhere in the repo, and
  `npm run icons -- --check` keeps the icon module in sync.
