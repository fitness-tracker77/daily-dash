# cycle.json schema (version 2)

A cycle file holds the **plan** for one cycle: meals, recipes, training and runs, targets, pantry stock and the fun comparison weights. The app never hard-codes any of these. Everything you **log** (ticks, grams eaten, sets, effort, notes, runs, weigh-ins, pantry counts) is stored separately on the phone and is never part of this file.

To use a cycle: copy the file's full text, open the app, tap the gear (Settings), paste into **Import cycle**, and tap **Import cycle**. It is checked, then stored only on that phone. Without an imported cycle the app shows `data/cycle.example.json`, a complete example with obviously fake data. Copy its shape.

## Ground rules

- Dates are local calendar dates written `YYYY-MM-DD`. Times are `HH:MM` (24 h).
- Numbers are plain JSON numbers (`80`, `10.4`), never strings (`"80"`).
- Nothing is guessed. If a field is missing or invalid, the import lists a warning naming the exact field (for example `days[3].slots[1].items[0].kcal` or `sessions.2026-11-02.exercises[0].muscle_group`). You can fix the file or choose **Import anyway**; affected numbers are then left out and shown as "not logged" or "missing".
- Invalid JSON is rejected with the parser's message and nothing is stored.
- Importing a new cycle never wipes your logged history. Keep exercise names the same across cycles so history, PRs and charts stay connected.

## Top level

```json
{
  "schema_version": 2,
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
| `schema_version` | yes | number | `2`. Version 1 files still import (see "Version 1 files" below). |
| `meta` | yes | object | Cycle name, dates, targets, bodyweight path. |
| `days` | yes | array | One entry per planned date: the day's timeline. |
| `recipes` | no | object | Recipes keyed by `recipe_id`, used by Cook mode. |
| `sessions` | no | object | Training sessions (lifting or running) keyed by date. |
| `pantry` | no | array | Starting pantry stock for this cycle. |
| `fun_equivalents` | no | array | Reference weights for "You have lifted N …". If missing, those lines are hidden. |

## meta

| Field | Required | Type | Meaning |
|---|---|---|---|
| `cycle_name` | yes | string | Shown under the date on Today. |
| `start_date` | yes | date | First day of the cycle. Used for "Day X of Y", the bodyweight path and "This cycle" export. |
| `end_date` | yes | date | Last day of the cycle (inclusive). The pantry's "needs" figure and the shopping list run to this date. |
| `daily_kcal_target` | yes | number | Target for the energy ring and the dashed line on the energy chart. |
| `daily_protein_target_g` | yes | number | Target for the protein ring, in grams. |
| `bodyweight_start_kg` | no | number | Start of the dashed bodyweight path. |
| `bodyweight_target_kg` | no | number | End of the path. If either bodyweight field is missing, there is no path and no above/below marks. |
| `priority_muscle` | no | string | A `muscle_group` name drawn in gold on the weekly muscle-volume chart. |
| `example` | no | boolean | `true` shows the "EXAMPLE — not real data" line. Leave it out of real files. |

The bodyweight path is a straight line from `bodyweight_start_kg` on `start_date` to `bodyweight_target_kg` on `end_date`. Each weigh-in is marked above or below it.

## days[]

```json
{ "date": "2026-11-02", "slots": [ { ... }, { ... } ] }
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `date` | yes | date | The day this plan is for. Each date once. |
| `slots` | yes | array | Timeline rows for that day. The app sorts them by `time`. |

### slots[]

| Field | Required | Type | Meaning |
|---|---|---|---|
| `id` | recommended | string | Stable id within the day, such as `"breakfast"`. Ticks are saved under it. Without an id the app builds one from time + type + title, so changing any of those would detach an old tick. |
| `time` | yes | `HH:MM` | Time shown on the timeline. |
| `type` | yes | string | One of `meal`, `gym`, `cook`, `freezer`, `note`. |
| `title` | yes | string | Row title. |
| `recipe_id` | no | string | Key into `recipes`. On a `cook` slot it adds Cook mode. On any slot the long-press detail lists the steps. |
| `notes` | no | string | Extra text on the row and in the detail. |
| `items` | meal: yes | array | Planned portions (below). |

Slot types:

- **meal**: tickable. Counts toward the energy and protein rings, the day's completion and the streak. Ticking subtracts the grams eaten from the pantry and labels that pantry line "calculated".
- **gym**: the timeline marker for that date's session (lifting or running). It is done when every set is ticked, or when the run is logged. Tapping it opens Train.
- **cook**: tickable, for your own record. Shows Cook mode when `recipe_id` points to a recipe. Its items are only listed: they do **not** count toward the rings, the pantry or the shopping list (put what you eat on meal slots).
- **freezer**: tickable reminder. Does not count toward completion.
- **note**: plain information, not tickable.

### items[] (inside a slot)

```json
{ "name": "Oats", "item_id": "oats", "grams": 80, "kcal": 304, "protein_g": 10.4 }
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `name` | yes | string | Shown on the row. |
| `item_id` | for pantry | string | Must match a `pantry[].item_id` to be subtracted from the pantry and to appear in its "needs" figure and the shopping list. Items without one are listed as "not tracked". Items with an id but no pantry line show "not in pantry list". |
| `grams` | yes | number > 0 | The planned portion in grams. |
| `kcal` | meal: yes | number | kcal for **this planned portion** (not per 100 g). |
| `protein_g` | meal: yes | number | Protein in grams for **this planned portion**. |

If you edit the grams you actually ate, the app scales linearly: `kcal eaten = kcal × grams eaten ÷ grams`.

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
| `title` | yes | string | Shown in Cook mode. |
| `servings` | no | number | For reference only. |
| `steps` | yes | array | One screen per step in Cook mode. |
| `steps[].text` | yes | string | The instruction, in large type. |
| `steps[].timer_seconds` | no | number > 0 | Adds a start/pause timer to that step. It vibrates and beeps when done. |
| `steps[].doneness_test` | no | string | Shown in a highlighted box on that step. |

## sessions{}

Keyed by date. Each session is either lifting (`"kind": "lift"`, the default) or running (`"kind": "run"`). A session can exist without a `gym` slot, but adding one puts it on the timeline.

### Lifting session

```json
"2026-11-02": {
  "kind": "lift",
  "title": "Session A",
  "exercises": [
    { "name": "Back squat", "muscle_group": "legs", "sets": 3, "reps": 5, "load_kg": 60, "rest_seconds": 180, "notes": "Belt on top set" },
    { "name": "Push-up", "muscle_group": "chest", "sets": 2, "reps": 10, "load_kg": null }
  ]
}
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `kind` | no | `"lift"` or `"run"` | Defaults to `"lift"`. |
| `title` | no | string | Session name. |
| `exercises` | yes | array | Exercises in order. |
| `exercises[].name` | yes | string | Exercise name. History, "last", PRs and charts follow the name (in lowercase), so **keep names identical across cycles**. |
| `exercises[].id` | no | string | Use instead of the name to link history across cycles if you rename an exercise. |
| `exercises[].muscle_group` | yes (v2) | string | For example `legs`, `back`, `chest`, `shoulders`, `arms`, `core`. Weekly volume per muscle group sums sets × reps × kg of ticked sets. Missing: the exercise counts as "ungrouped" and the import warns. |
| `exercises[].sets` | yes | whole number | Planned sets. Each becomes a row you tick. Every set must be ticked for the day to count as complete. |
| `exercises[].reps` | yes | whole number | Planned reps per set. |
| `exercises[].load_kg` | no | number or `null` | Planned load. `null` for bodyweight work: those sets count toward sets and reps but not toward weight lifted. |
| `exercises[].rest_seconds` | no | number > 0 | Rest timer length after each set. Without it, the default from Settings (90 s unless you change it). |
| `exercises[].notes` | no | string | Shown under the plan line. |

The reps and kg boxes are prefilled from your **last logged set** of that exercise (earlier today included). With no history they are prefilled from the plan.

### Running session

```json
"2026-11-03": { "kind": "run", "title": "Easy run", "distance_km": 5, "notes": "Conversational pace" }
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `kind` | yes | `"run"` | Marks a run. |
| `title` | no | string | Session name. |
| `distance_km` | no | number > 0 | Planned distance, shown on Train. |
| `notes` | no | string | Shown on Train. |

On Train you log the distance (km), the time (`mm:ss` or `h:mm:ss`) and notes. Pace is computed as time ÷ distance. Logging the run completes the session.

## pantry[]

The stock at the start of the cycle. Each line appears on Fuel.

```json
{ "item_id": "oats", "name": "Oats", "quantity": 500, "unit": "g", "source": "counted", "as_of": "2026-11-01" }
{ "item_id": "eggs", "name": "Eggs", "quantity": 12, "unit": "pcs", "grams_per_unit": 50, "source": "counted", "as_of": "2026-11-01" }
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `item_id` | yes | string | Matches `items[].item_id` in meals. |
| `name` | yes | string | Display name. |
| `quantity` | yes | number | Amount on hand. |
| `unit` | yes | string | `g` and `kg` convert from meal grams automatically. Any other unit (`pcs`, `jar`, …) needs `grams_per_unit`; without it, Fuel says so instead of guessing. |
| `grams_per_unit` | no | number > 0 | Grams in one unit, for example `50` for one egg. |
| `source` | yes | `"counted"` or `"calculated"` | `counted`: you weighed or counted it. `calculated`: derived. |
| `as_of` | yes | date | Date of that count or calculation. |

How the phone uses it: the first time a line appears, or whenever an imported file changes its quantity, unit, source, as_of or grams_per_unit, the phone resets that line to the file's values. Otherwise it keeps its own running amount: meals you tick are subtracted (label becomes "calculated"), **Recount** replaces the amount with what you measured (label "counted", today's date), and **Bought** adds to it.

## fun_equivalents[]

```json
{ "name": "grand piano", "plural": "grand pianos", "kg": 400, "note": "Reference weights are rough approximations." }
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `name` | yes | string | Singular name. |
| `plural` | yes | string | Used in "You have lifted N <plural>". |
| `kg` | yes | number > 0 | Reference weight. Your total lifted ÷ kg. |
| `note` | yes | string | Always shown in small type under the comparisons. Say the weights are approximate. |

## What is computed, and from what

| Shown | Computed from |
|---|---|
| Energy and protein rings | Grams you ticked × the item's kcal or protein ÷ its planned grams, against the `meta` targets. |
| Next up | The first unticked meal, cook or freezer slot, or the unfinished session, in time order. |
| Day complete and streak | A day is complete when every meal slot and every set (or the run) of that date's session is done. Days with nothing planned neither add to nor break the streak. |
| Volume | Sets × reps × kg of ticked sets only. Sets without a load count as sets and reps, not volume. |
| PR | A set's kg beats your best kg for that exercise on any **earlier** date. No history, no PR. |
| Estimated 1RM | **Estimate**, Epley formula: kg × (1 + reps ÷ 30), only from sets of 1 to 10 reps. Always labelled "estimate". |
| Pantry: have against need | Current amount against the planned grams of that item from today to `end_date`, converted to the line's unit. Today's already-ticked meals are excluded because they were already subtracted. "No planned use" when the item is not in the remaining plan. |
| Shopping list | Planned grams from today to `end_date` minus current stock, per item, shortfalls only, labelled "based on counted" or "based on calculated". |
| Averages (kcal, protein) | Only over days with at least one ticked meal. |
| Weekly recap (Sundays) | Monday to Sunday: days completed, averages, sessions, volume and PRs, from logged data only. |

## Version 1 files

A file with `"schema_version": 1` (or the older format without `muscle_group`) still imports. The import lists one warning for every exercise without `muscle_group`; after **Import anyway**, those exercises appear as "ungrouped" in the muscle charts. Everything else works as before.

## Worked example

A two-day cycle with one lifting day and one run. Hand arithmetic for 1 March: breakfast is 80 g oats (304 kcal, 10.4 g protein) + 200 g yogurt (120 kcal, 20 g), so ticking it fills the rings to 424 kcal and 30.4 g. Oats: 500 g in stock, the plan needs 2 × 80 = 160 g, so nothing to buy. Squat 3 × 5 × 60 kg = 900 kg volume; estimated 1RM 60 × (1 + 5 ÷ 30) = 70 kg (estimate).

```json
{
  "schema_version": 2,
  "meta": {
    "cycle_name": "Spring block 1",
    "start_date": "2027-03-01",
    "end_date": "2027-03-02",
    "daily_kcal_target": 2200,
    "daily_protein_target_g": 140,
    "bodyweight_start_kg": 70.0,
    "bodyweight_target_kg": 70.2,
    "priority_muscle": "back"
  },
  "days": [
    { "date": "2027-03-01", "slots": [
      { "id": "breakfast", "time": "07:30", "type": "meal", "title": "Oats and yogurt",
        "items": [
          { "name": "Oats", "item_id": "oats", "grams": 80, "kcal": 304, "protein_g": 10.4 },
          { "name": "Yogurt", "item_id": "yogurt", "grams": 200, "kcal": 120, "protein_g": 20 }
        ] },
      { "id": "gym", "time": "17:30", "type": "gym", "title": "Session A" }
    ] },
    { "date": "2027-03-02", "slots": [
      { "id": "run", "time": "07:00", "type": "gym", "title": "Easy run" },
      { "id": "breakfast", "time": "08:00", "type": "meal", "title": "Oats and yogurt",
        "items": [
          { "name": "Oats", "item_id": "oats", "grams": 80, "kcal": 304, "protein_g": 10.4 },
          { "name": "Yogurt", "item_id": "yogurt", "grams": 200, "kcal": 120, "protein_g": 20 }
        ] }
    ] }
  ],
  "recipes": {},
  "sessions": {
    "2027-03-01": { "kind": "lift", "title": "Session A", "exercises": [
      { "name": "Back squat", "muscle_group": "legs", "sets": 3, "reps": 5, "load_kg": 60, "rest_seconds": 180 },
      { "name": "Barbell row", "muscle_group": "back", "sets": 3, "reps": 8, "load_kg": 40 }
    ] },
    "2027-03-02": { "kind": "run", "title": "Easy run", "distance_km": 5 }
  },
  "pantry": [
    { "item_id": "oats", "name": "Oats", "quantity": 500, "unit": "g", "source": "counted", "as_of": "2027-02-28" },
    { "item_id": "yogurt", "name": "Yogurt", "quantity": 1, "unit": "kg", "source": "counted", "as_of": "2027-02-28" }
  ],
  "fun_equivalents": [
    { "name": "grand piano", "plural": "grand pianos", "kg": 400, "note": "Reference weights are rough approximations." }
  ]
}
```

## Prompt for Claude to write a new cycle

> Using the cycle.json schema version 2 below, write a cycle.json for my next cycle from START DATE to END DATE. Targets: X kcal and Y g protein a day. Bodyweight path from A kg to B kg. Priority muscle group: M. Here are my meals for each day, my recipes, my training plan (lifting days with sets, reps, kg, rest and the muscle group of each exercise; run days with planned distance) and my pantry counts with the date I counted them: … Give `kcal` and `protein_g` for each planned portion, not per 100 g. Give every meal item an `item_id` that matches a pantry line when I keep it in stock. Give every exercise a `muscle_group`. Keep exercise names exactly as in my previous cycle. Do not include `"example": true`. Do not invent numbers I did not give you: if something is missing, ask me. Output only the JSON so I can copy it and import it in the app.
