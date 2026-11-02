# cycle.json schema (version 1)

A cycle file holds **all** content for the app: meals, recipes, workouts, targets, pantry and the fun comparison weights. The app never hard-codes any of these.

To use a cycle, copy the file's full text, open the app, tap Settings → Import cycle, paste, and tap Import cycle. It is validated, then stored only on that phone. It is never uploaded anywhere. Without an imported cycle, the app shows `data/cycle.example.json`, a complete working example with obviously fake data. Copy its shape.

## Ground rules

- Dates are local calendar dates written `YYYY-MM-DD`. Times are `HH:MM` (24 h).
- Numbers are plain JSON numbers (`80`, `10.4`), never strings (`"80"`).
- If a field is missing or invalid, the app shows a warning card naming the exact field (for example `days[3].slots[1].items[0].kcal`) and leaves that number out of every total. It never guesses a value.
- Your history (ticks, grams, sets, bodyweight, pantry counts, streaks, badges) lives on the phone in localStorage, keyed by date. Importing a new cycle never wipes it.
- Invalid JSON is rejected on import with the parser's message, and nothing is stored. Valid JSON with missing fields lists every problem first and lets you choose "Import anyway".

## Top level

```json
{
  "schema_version": 1,
  "meta": { ... },
  "days": [ ... ],
  "recipes": { ... },
  "sessions": { ... },
  "pantry": [ ... ],
  "fun_equivalents": [ ... ]
}
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `schema_version` | recommended | number | Always `1` for this format. |
| `meta` | yes | object | Cycle name, dates and targets. |
| `days` | yes | array | One entry per planned date. |
| `recipes` | no | object | Recipes keyed by `recipe_id`, used by cook mode. |
| `sessions` | no | object | Training sessions keyed by date. |
| `pantry` | no | array | Starting pantry stock for this cycle. |
| `fun_equivalents` | no | array | Reference weights for "You have lifted N …". If missing, that part is hidden. |

## meta

| Field | Required | Type | Meaning |
|---|---|---|---|
| `cycle_name` | yes | string | Shown in the Today header. |
| `start_date` | yes | date | First day of the cycle. Used for "Day X of Y", the target line and "this cycle" stats. |
| `end_date` | yes | date | Last day of the cycle (inclusive). |
| `daily_kcal_target` | yes | number | Target for the kcal ring. |
| `daily_protein_target_g` | yes | number | Target for the protein ring, in grams. |
| `bodyweight_start_kg` | no | number | Start of the dashed target line on the Log chart. |
| `bodyweight_target_kg` | no | number | End of the dashed target line. If either bodyweight field is missing, no target line and no above/below marks are shown. |
| `example` | no | boolean | `true` shows the "EXAMPLE — not real data" banner. Leave it out of real files. |

The target line runs in a straight line from `bodyweight_start_kg` on `start_date` to `bodyweight_target_kg` on `end_date`.

## days[]

```json
{ "date": "2026-11-02", "slots": [ { ... }, { ... } ] }
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `date` | yes | date | The day this plan is for. Each date should appear once. |
| `slots` | yes | array | Timeline entries for that day. The app sorts them by `time`. |

### slots[]

| Field | Required | Type | Meaning |
|---|---|---|---|
| `id` | recommended | string | Stable id within the day, such as `"breakfast"`. Ticks are saved under it. Without an id, the app builds one from time + type + title, so changing any of those would detach an old tick. |
| `time` | yes | `HH:MM` | Time shown on the timeline. |
| `type` | yes | string | One of `meal`, `gym`, `cook`, `freezer`, `note` (see below). |
| `title` | yes | string | Card title. |
| `recipe_id` | no | string | Key into `recipes`. On a `cook` slot it adds the Cook mode button. On any slot, the long-press detail lists the recipe steps. |
| `notes` | no | string | Extra text shown on the card and in the detail view. |
| `items` | meal: yes | array | Planned portions (see below). |

Slot types:

- **meal**: tickable. Counts toward the kcal and protein rings, the day's completion and the streak. Ticking subtracts the eaten grams from the pantry.
- **gym**: a marker on the timeline. Its done state comes from the session's sets in `sessions[date]`, and tapping it opens Training.
- **cook**: tickable, for your own record. Shows Cook mode when `recipe_id` points to a recipe. Its items are only listed: they do **not** count toward the rings, the pantry or the shopping list (put what you eat on meal slots).
- **freezer**: tickable reminder, for example moving portions to the freezer. Does not count toward completion.
- **note**: plain information. Not tickable.

### items[] (inside a slot)

```json
{ "name": "Oats", "item_id": "oats", "grams": 80, "kcal": 304, "protein_g": 10.4 }
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `name` | yes | string | Shown on the card. |
| `item_id` | for pantry | string | Must match a `pantry[].item_id` to be subtracted from the pantry and appear on the shopping list. Items without one are listed as "not tracked". Items with an id but no pantry line show as "not in pantry list". |
| `grams` | yes | number > 0 | The planned portion in grams. |
| `kcal` | meal: yes | number | kcal for **this planned portion** (not per 100 g). |
| `protein_g` | meal: yes | number | Protein in grams for **this planned portion**. |

If you edit the grams you actually ate, the app scales linearly: `eaten kcal = kcal × eaten_grams / grams`.

## recipes{}

Keyed by `recipe_id`:

```json
"recipes": {
  "lentil_stew": {
    "title": "Lentil stew",
    "servings": 4,
    "steps": [
      { "text": "Rinse the lentils." },
      { "text": "Simmer.", "timer_seconds": 1200, "doneness_test": "A lentil crushes easily against the pot." }
    ]
  }
}
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `title` | yes | string | Shown in cook mode. |
| `servings` | no | number | Shown for reference only. |
| `steps` | yes | array | One screen per step in cook mode. |
| `steps[].text` | yes | string | Step instruction, shown in large text. |
| `steps[].timer_seconds` | no | number > 0 | Adds a start/pause timer to that step. It vibrates and beeps when done. |
| `steps[].doneness_test` | no | string | Shown in a highlighted box on that step. |

## sessions{}

Keyed by date. A session can exist without a `gym` slot, but adding one puts it on the timeline.

```json
"sessions": {
  "2026-11-02": {
    "title": "Session A",
    "exercises": [
      { "name": "Back squat", "sets": 3, "reps": 5, "load_kg": 60, "notes": "Belt on top set" },
      { "name": "Push-up", "sets": 2, "reps": 10, "load_kg": null }
    ]
  }
}
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `title` | no | string | Session name. |
| `exercises` | yes | array | Exercises in order. |
| `exercises[].id` | no | string | Stable id for history across cycles. Defaults to the name in lowercase, so **keep exercise names identical across cycles** to keep PRs and charts connected. |
| `exercises[].name` | yes | string | Exercise name. |
| `exercises[].sets` | yes | whole number | Planned sets. Each becomes a tappable chip. Every set must be ticked for the day to count as complete. |
| `exercises[].reps` | yes | whole number | Planned reps per set. Prefills the reps box. |
| `exercises[].load_kg` | no | number or `null` | Planned load. Prefills the kg box. Use `null` for bodyweight work: those sets count toward sets and reps but not toward weight lifted. |
| `exercises[].notes` | no | string | Shown under the exercise name. |

## pantry[]

The stock at the start of the cycle. Each line is shown on the Pantry tab.

```json
{ "item_id": "oats", "name": "Oats", "quantity": 500, "unit": "g", "source": "counted", "as_of": "2026-11-01" }
{ "item_id": "eggs", "name": "Eggs", "quantity": 12, "unit": "pcs", "grams_per_unit": 50, "source": "counted", "as_of": "2026-11-01" }
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `item_id` | yes | string | Matches `items[].item_id` in meals. |
| `name` | yes | string | Display name. |
| `quantity` | yes | number | Amount on hand. |
| `unit` | yes | string | `g` or `kg` convert from meal grams automatically. Any other unit (`pcs`, `jar`, …) needs `grams_per_unit` to be subtracted or compared. Without it, the shopping list says so instead of guessing. |
| `grams_per_unit` | no | number > 0 | Grams in one unit, for example `50` for one egg. |
| `source` | yes | `"counted"` or `"calculated"` | `counted` means you weighed or counted it. `calculated` means it was derived. |
| `as_of` | yes | date | Date of that count or calculation. |

How the phone uses it: the first time a pantry line appears, or whenever an imported cycle changes its quantity, unit, source, as_of or grams_per_unit, the phone resets that line to the file's values. Otherwise it keeps the local running total (meals subtracted, Recount, Bought).

## fun_equivalents[]

```json
{ "name": "grand piano", "plural": "grand pianos", "kg": 400, "note": "Reference weights are rough approximations." }
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `name` | yes | string | Singular name. |
| `plural` | yes | string | Used in "You have lifted N.N <plural>". |
| `kg` | yes | number > 0 | Reference weight. All-time weight lifted ÷ kg, to one decimal place. |
| `note` | yes | string | Shown in small text under the comparisons. Say the weight is approximate. |

Three items are shown at a time, rotating daily. "Show other comparisons" cycles through the rest.

## What is computed, and from what

| Shown | Computed from |
|---|---|
| Rings | Grams you actually ticked × the item's kcal/protein ÷ its planned grams, against `meta` targets. |
| Day complete | Every meal slot ticked, and every set of that date's session ticked. Days with neither are neutral. |
| Shopping list | Planned meal grams for today (unticked meals only) through `end_date`, per `item_id`, minus the current pantry quantity. Only shortfalls are listed. |
| Weight lifted, PRs, stats | Only sets you ticked, with the reps and kg in the boxes when ticked. A PR is a load above your best for that exercise on any earlier date. |
| Week recap | Days completed, kcal/protein averages over days with ticked meals, sessions, weight lifted and PRs for Monday–Sunday. Anything with no logged data shows "not logged". |

## Prompt for Claude to write a new cycle

> Using data/SCHEMA.md, write a cycle.json for my next cycle from DATE to DATE. Targets: X kcal and Y g protein a day. Bodyweight line from A kg to B kg. Here are my meals, recipes, training plan and pantry counts: …  Give `kcal` and `protein_g` for each planned portion, not per 100 g. Keep exercise names exactly as in my previous cycle. Do not include `"example": true`. Output only the JSON so I can copy it and import it in the app.
