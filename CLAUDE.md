# Daily Dash — working notes for Claude

Plain HTML/CSS/ES-module JS PWA (no build, no backend). Hosted on GitHub Pages. Data lives in IndexedDB on the phone.

## Working rules
- Open only the files a task needs. Edit in place with the smallest change.
- While working, run only the related tests; run the full suite once at the very end of a session.
- Browser check only for visual or interactive changes.
- PRIVATE TEST DATA: `private/` (gitignored) holds the real backup and cycle. Never commit it, never print its contents. Check `git status` shows it unstaged.
- Update this file whenever key formats or the file map change.
- Example guard: while the built-in example cycle is active, `model.js` does not write meals/grams/sets/exlog/runs/pantry/pantryEvents/days/badges (`wput`/`wkv`). `cleanExampleData()` (run in `applyCycle`, so after import and restore) deletes leftover records marked `ex_*` / `Example*` / `example-*`, then rebuilds days and badges.
- Missing input = `null` / "not logged", never a guessed number.

## File map
- `index.html` shell, `manifest.json` PWA manifest, `sw.js` service worker (caches shell; `VERSION` must be bumped on every code change).
- `js/app.js` boot, tab routing, `APP_VERSION` (keep equal to sw.js VERSION suffix).
- `js/store.js` IndexedDB + in-memory maps. Exports `init, all, values, get, put, del, kv, setKv, delKv, replaceAll, flush, onChange, revision, COLLS, LOG_COLLS, DEVICE_KV, convertLegacy, saveImported, readImported, clearImported`.
- `js/data.js` cycle loading/validation. Exports `loadCycle, checkImport, validate, Cycle, slotKey, exKey, SLOT_TYPES`.
- `js/model.js` all computation (ticks, pantry, sets, PRs, progress, rollups, insights data, badges, export text). Exports listed by `grep ^export js/model.js`.
- `js/backup.js` backup build/check/apply (`buildBackup, checkBackup, applyBackup, countsOf`).
- `js/util.js` dates, number formatting, `esc`, `uid`, `slug`, audio/haptics.
- `js/ui.js` sheets, toast, confetti, rings, `ICON`. `js/charts.js` SVG `lineChart, barChart, donut, sparkline, progressBar, haveNeed`.
- `js/cook.js` Cook mode (`openCook`). `js/rest.js` rest timer (`startRest, stopRest, addRest, restState`).
- `js/views/{today,train,fuel,insights,log,settings}.js` one `render*` per screen; `common.js` shared blocks (`head, warningBlock, backupBanner, recapBlock, kg, NL`).
- `css/app.css` all styles. `data/SCHEMA.md` cycle.json format; `data/cycle.example.json` built-in fake cycle (`meta.example: true`).
- `tools/make-example.mjs` regenerates the example. `tests/` node:test suites; `tests/helpers.js` loads cycles and resets the store.

## Store keys (collections in store.js; records always carry `key`)
- `meals` `${date}|${slotKey}` (slotKey = `id:<slot.id>` or `time|type|slug(title)`): tick snapshot with items, grams, `deducted` pantry amounts.
- `grams` `${date}|${slotKey}`: typed grams `{g:{idx:grams}}`.
- `sets` `${date}|@${pos}|${i}` (pos = card index in the file's exercise list for that day, so a repeated exercise has separate sets): `{date, pos, ex, name, muscle, idx, done, reps, load, ts}`. Old `date|exId|i` keys are moved to the FIRST card of that id by `model.migratePositionKeys()` (run in `applyCycle`, so after import and restore; unmatched rows keep their old key).
- `exlog` `${date}|@${pos}`: `{date, pos, ex, name, effort, note}`. History/PRs/volume group by the `ex` id, never by key; use `exLogFor(date, id)` to merge cards.
- `runs` `${date}|run`. `bodyweight` `${date}` `{kg, ts}`.
- `pantry` `${item_id}`: `{quantity, source: counted|calculated, as_of, baseSig}`.
- `pantryEvents` random `uid()`: `{date, ts, item_id, kind: recount|bought, amount, unit}`.
- `days` `${date}`: `{planned, done, complete}` snapshot (keeps streaks across cycles).
- `kv` name: `badges, celebrated, settings` (history) and device-only `cycleImport, migration, lastBackup, rollupsVersion` (not in backups).
- `rollups` `d:|w:|m:` + date: derived, rebuilt from raw logs.

## Data flow (imported cycle -> views)
1. Settings pastes text -> `data.checkImport/validate` -> `store.saveImported` (kv `cycleImport`).
2. `app.js` boot: `loadCycle()` returns `Cycle` (imported, else example) -> `model.setCycle(c)`.
3. `model.js` reads `cycle()` for the plan and `store` for logs; derived values are memoised until `store.onChange`.
4. Each `views/*.js` render pulls from model functions only (never touches store layout directly except for writes through model).
5. Logged data is never part of the cycle file, so a re-import keeps all ticks/sets/history.

## Tests
- Full suite: `npm test` (= `node --test "tests/*.test.js"`).
- One file: `npm run test:file -- tests/<name>.test.js` (or `node --test tests/<name>.test.js`).
- No IndexedDB in tests: they use the in-memory store (`tests/helpers.js`).

## Ship steps
1. Bump `VERSION` in `sw.js` (and `APP_VERSION` in `js/app.js`).
2. Commit with the repo's existing no-reply identity (`fitness-tracker77`); never change git identity.
3. `git push`.
