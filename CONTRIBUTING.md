# Contributing to Pecking Order

Thanks for wanting to help. This project tries hard to be easy to jump into: one
`npm ci`, no services to run, no keys to request.

- **Adding a template?** Read [CONTRIBUTING-PACKS.md](CONTRIBUTING-PACKS.md). It is
  the friendliest first contribution and needs no TypeScript.
- **Changing code?** Keep reading.

## Setup

```sh
npm ci
npm run dev          # http://localhost:5173
npm test             # unit and component tests
npm run e2e          # Playwright end-to-end + axe accessibility checks
```

Playwright needs a browser once: `npx playwright install chromium`.

## Where things live

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The short version:

- `src/core` is pure TypeScript with no React, DOM or storage. Board changes are
  `op*` functions that mutate a draft; the store runs them inside Immer, which
  gives cheap undo. If you add a new kind of edit, add an op and a test here first.
- `src/ui` is React. Components read from the stores with selectors and call the
  shared actions in `src/ui/actions.ts`, so keyboard shortcuts, menus and WebMCP
  tools all behave identically.
- Styling is CSS Modules on top of the tokens in `src/styles/tokens.css`. Use the
  tokens rather than raw colours; dark mode then works for free.
- Icons come from `@/ui/icons`. Import a new Phosphor icon by name, then run
  `npm run icons`.

## House style

- **Copy** is dry and friendly, with at most one chicken pun on screen at a time,
  and never on errors or destructive actions. No em dashes (a test enforces it).
  Labels are sentence case; no shouty letter-spaced capitals.
- **Accessibility is not optional.** Every control has an accessible name, every
  drag has a keyboard and tap alternative, colours meet WCAG AA in both themes, and
  motion respects `prefers-reduced-motion`. The e2e suite runs axe on every screen.
- **Untrusted input** (files, pastes, URLs, packs, backups) goes through the
  validators in `src/core/validate.ts`, `src/packs/spec.ts` and
  `src/storage/peckFile.ts`. Never render remote HTML.
- **No new runtime dependencies** without a good reason in the PR. The whole app
  ships around 106 KB of gzipped JavaScript before a board opens; let's keep it lean.

## Before you open a pull request

```sh
npm run lint && npm run typecheck && npm test && npm run e2e
```

CI runs the same checks plus `npm audit`. Keep commits small with imperative
messages ("Add a 'clear all tiers' action", not "changes"). Screenshots in the PR
description help a lot for anything visual: light and dark, desktop and phone.
