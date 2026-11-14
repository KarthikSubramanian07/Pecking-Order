# Contributing a pack

A **pack** is a ready-made topic: pick it in the app and you get a fresh board
filled with items and pictures, ready to rank. Packs are plain JSON files that
live in this repo, so adding one is a small pull request and no code.

You need Node 24 (see `.nvmrc`) and a clone of the repo with `npm ci` run once.

## Quick start

1. Copy the template folder and rename it to your pack's id:

   ```sh
   cp -r packs/_template packs/breakfast-cereals
   ```

2. Edit `packs/breakfast-cereals/pack.json`. Set `"id"` to the folder name and
   replace the example items. Editors that understand JSON Schema (VS Code,
   JetBrains, Zed) autocomplete every field thanks to the `"$schema"` line.
3. Validate it:

   ```sh
   npm run packs:validate
   ```

4. Check that every image actually loads:

   ```sh
   node scripts/verify-pack-images.mjs breakfast-cereals
   ```

5. Try it for real with `npm run dev`, then open a pull request.

Folders whose names start with `_` (like `_template`) are never built.

## The fields

| Field         | Required | What it is                                                                                                                                         |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | yes      | Kebab-case, equal to the folder name. Never changes once merged.                                                                                   |
| `version`     | yes      | Semantic version, starting at `1.0.0`. Bump the minor for new items, the patch for fixes.                                                          |
| `title`       | yes      | Up to 60 characters. Becomes the board title.                                                                                                      |
| `description` | yes      | One line, up to 140 characters. Dry and understated reads best: _"Pluto's legal team has been notified."_                                          |
| `category`    | yes      | One of `Animals`, `Food & Drink`, `Film & TV`, `Games`, `Music`, `Places`, `Science & Nature`, `Sports`, `Tech`, `Miscellaneous`.                  |
| `author`      | yes      | Your name or handle.                                                                                                                               |
| `accent`      | no       | A palette swatch that tints the catalog card: `Comb`, `Yolk`, `Corn`, `Pasture`, `Eucalyptus`, `Duck Egg`, `Heather`, `Speckle`, `Rhubarb`, `Oat`. |
| `tiers`       | no       | 2 to 20 custom tier labels, top to bottom, each up to 32 characters. Leave it out for the classic S to F.                                          |
| `items`       | yes      | 3 to 150 items. Somewhere between 15 and 40 is the sweet spot.                                                                                     |

Each item has:

| Field                             | Required | What it is                                                                        |
| --------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `id`                              | yes      | Kebab-case, unique in the pack. Never change it once merged (boards refer to it). |
| `label`                           | yes      | What the tile says, up to 80 characters. Unique in the pack.                      |
| `wikipedia`, `commons` or `image` | no       | Where the picture comes from (pick at most one, see below). None means text tile. |
| `tags`                            | no       | Up to 10 kebab-case tags. Unused today; handy for future filters.                 |

Unknown fields are rejected, so typos get caught instead of silently ignored.

## Choosing images

Images are fetched by the user's browser when they install the pack, so every
source has to allow cross-origin requests. You have three options.

**`"wikipedia": "Article title"`** (the default choice). The app uses the lead
image of that English Wikipedia article. Use the exact article title, not a URL.
Watch out for disambiguation pages (`"Mercury"` is several things; you want
`"Mercury (planet)"`) and prefer the canonical title over a redirect. The
verify script flags both missing articles and disambiguation pages.

**`"commons": "File:Name.jpg"`**. A specific file from
[Wikimedia Commons](https://commons.wikimedia.org). Use this when the article's
lead image is missing, a screenshot, a logo you don't want, or not freely
licensed. Commons gives the app the author and licence for attribution.

**`"image": "https://..."`**. A direct https URL, only on these hosts (they send
`Access-Control-Allow-Origin: *`):

- `upload.wikimedia.org`, `thumb.wikimedia.org`
- `raw.githubusercontent.com`
- `covers.openlibrary.org`
- `www.themealdb.com`
- `static.tvmaze.com`

Need another host? Add it to `ALLOWED_IMAGE_HOSTS` in both
`scripts/pack-validate.mjs` and `src/packs/spec.ts` (a test keeps them in sync)
and the image pattern in `packs/pack.schema.json`, and say why in the PR.

**No source at all** gives a text tile. That's fine for a few items where no good
picture exists; it beats a wrong picture.

Good images are recognisable at thumbnail size: one subject, centred, not a
crowd shot, not a diagram. Logos work well for software and brands; photos work
best for food, animals and objects.

### Licensing

- **Commons** files carry their own licence (CC BY, CC BY-SA, public domain and
  so on). The app keeps the author, licence and source link with each image.
  Prefer Commons for anything you can.
- **Wikipedia lead images** are usually Commons files too, but some, such as
  film posters, album covers and some logos, are non-free and used on Wikipedia
  under fair use. They show up with a "See Wikipedia" credit. Use them only
  where nothing free would do (posters for a film pack, say).
- Don't link images from sites that didn't agree to it, and never commit image
  files to this repo.

## Checking your work

```sh
npm run packs:validate                               # rules, offline, fast
node scripts/verify-pack-images.mjs <id> [<id>...]   # real network check
node scripts/verify-pack-images.mjs <id> --verbose   # also print every resolved URL
```

The validator prints the file and item for every problem, for example:

```text
packs/fruits/pack.json › item "kiwi" › label: must be at most 80 characters (got 92)
```

The verify script resolves each image exactly the way the app does and
downloads it, so a green run means users will see every picture. It talks to
Wikipedia and Commons, which is why it doesn't run in CI.

## Pull request checklist

- [ ] The folder name equals `id`, and the pack has 15 to 40 items.
- [ ] `npm run packs:validate` passes.
- [ ] `node scripts/verify-pack-images.mjs <id>` reports 0 broken.
- [ ] You opened the pack with `npm run dev` and the tiles look right.
- [ ] The topic is family friendly and not a culture-war magnet.
- [ ] Editing an existing pack? Item ids are unchanged and `version` is bumped.
- [ ] The PR description lists where any non-Wikipedia images come from.

## How packs reach the app

```text
packs/<id>/pack.json
        │  npm run packs:build (runs before dev, build, test and typecheck)
        ▼
scripts/build-packs.mjs ── validates with scripts/pack-validate.mjs
        │
        ├─▶ src/packs/generated/catalog.json   summaries, bundled into the app
        └─▶ public/packs/<id>.json             full pack, fetched on install
                │
                ▼
src/packs/install.ts ── re-checks the file (src/packs/spec.ts), resolves each
                        image (src/packs/resolve.ts) six at a time, stores it,
                        and returns a new board with every item in the coop
```

Both outputs are generated and git-ignored. If a picture fails to load when
someone installs a pack, that item quietly becomes a text tile; the pack itself
never fails because of one image.
