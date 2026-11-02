# Daily Dash

A personal operating center for training and nutrition, installable on iPhone from Safari.
Plain HTML, CSS and JavaScript (ES modules). No build step, no backend, no accounts, no analytics.
Hosted on GitHub Pages; fonts are self-hosted, so the app never contacts another site.

## Screens

- **Today**: date, cycle, day X of Y, streak; energy and protein rings from the grams you ticked; next up; the day's timeline. Tap to tick, long-press for detail, edit grams eaten, Cook mode.
- **Train**: today's session with "last" from your history, sets prefilled from your last logged set, PR badges, effort and notes, an automatic rest timer, exercise history with load and estimated-1RM charts, runs with pace.
- **Fuel**: pantry with days of stock left, Recount and Bought, and a shopping list for the rest of the cycle.
- **Insights**: weight lifted, weekly volume per muscle group, load and estimated 1RM, bodyweight against the target path, energy and protein, weekly run distance, a calendar of training and complete days, monthly review, badges, fun stats. A 2W / 1M / 3M / 6M / All switch applies to every chart.
- **Log**: everything you ticked or typed by date, with edit and delete; bodyweight; export for Claude.
- **Settings** (gear): import or reset the cycle, rest timer, backup and restore, storage status, theme.

Every figure comes from your cycle file, from what you logged, or from arithmetic on those. Missing data shows "not logged". Estimates are labelled "estimate".

## Where the data lives

- **Your cycle is never uploaded.** You paste it into the app (Settings, Import cycle) and it is stored only on your phone.
- Without an imported cycle the app shows [`data/cycle.example.json`](data/cycle.example.json), obviously fake and labelled "EXAMPLE — not real data". The format is in [`data/SCHEMA.md`](data/SCHEMA.md).
- Everything you log is stored on the phone in IndexedDB (database `daily-dash`), with weekly and monthly rollups so charts stay fast after months of use. Data from the earlier localStorage version is moved over once on first launch; the old copy is left in place as a read-only fallback.
- `data/cycle.json` is in `.gitignore`, so a real cycle file kept in this folder is never committed.

## Back up your history

Settings, **Save backup file**. On iPhone the share sheet opens: choose **Save to Files**. Today and Log show "Last backup N days ago", in gold after 7 days.
To restore: Settings, **Choose backup file**, check the counts, then **Merge** (adds what is missing, never duplicates) or **Replace** (wipes this phone's history first). Both ask before changing anything.

## New cycle

1. Copy the full text of the new cycle.json.
2. Open the app from the home screen.
3. Tap the gear (Settings), then **Paste** (or long-press the box and choose Paste).
4. Tap **Import cycle**. If the file has problems, each field is listed. Fix the file, or choose **Import anyway**; affected numbers are left out, never guessed.

**Reset to example** in Settings removes the imported cycle. Your history stays.

## Changing app code

Edit, then bump `VERSION` in `sw.js` and `APP_VERSION` in `js/app.js` together, commit and push. Installed copies download the new version the next time they open and reload into it; Settings shows the version.

## Local preview

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

`node tools/make-example.mjs` regenerates the example data.

Fonts: Cormorant Garamond and Hanken Grotesk, SIL Open Font License (see `fonts/`).
