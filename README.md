# Daily Dash

A personal iPhone dashboard (installable web app) for meals, training, pantry and a daily log.
Plain HTML, CSS and JavaScript. No build step, no backend, no accounts. Hosted on GitHub Pages.

## Where the data lives

- **Your cycle is never uploaded.** You paste it into the app (Settings → Import cycle) and it is stored only on your phone.
- Without an imported cycle, the app shows the built-in example, [`data/cycle.example.json`](data/cycle.example.json). It is obviously fake data.
- The format is documented in [`data/SCHEMA.md`](data/SCHEMA.md).
- Everything you tick or type (meals, grams, sets, bodyweight, pantry counts, streaks, badges) is stored on the phone, keyed by date.
  Importing a new cycle never wipes it.
- `data/cycle.json` is in `.gitignore`, so a real cycle file kept in this folder is never committed.

## New cycle

1. Copy the full text of the new cycle.json.
2. Open the app from the home screen.
3. Tap the gear icon (Settings), then paste into the Import cycle box. On iPhone, long-press the box and choose Paste, or tap Paste.
4. Tap **Import cycle**. If the file has problems, the app lists each field. Fix the file, or choose "Import anyway"; affected numbers are left out, never guessed.

"Reset to example" in Settings removes the imported cycle from the phone.

## Changing app code

Edit, then bump `VERSION` in `sw.js` so installed copies fetch the new files, then commit and push.

## Local preview

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

`node tools/make-example.mjs` regenerates the example data.
