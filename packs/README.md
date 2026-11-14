# Packs

Ready-made topics for Pecking Order, one folder per pack: `packs/<id>/pack.json`.

- **Add one:** copy `_template/`, follow [CONTRIBUTING-PACKS.md](../CONTRIBUTING-PACKS.md).
- **Validate:** `npm run packs:validate`
- **Check images:** `node scripts/verify-pack-images.mjs <id>`
- **Schema:** [`pack.schema.json`](pack.schema.json), for editor autocomplete.

Folders starting with `_` are ignored by the build.
