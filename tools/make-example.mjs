// Generates data/cycle.example.json, the built-in example cycle.
// Run: node tools/make-example.mjs
// Everything here is obviously fake placeholder content.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// per-100 g reference values for the fake items (only used to pre-compute item numbers here)
const ref = {
  ex_oats:    { name: 'Example oats',          kcal: 380, p: 13 },
  ex_yogurt:  { name: 'Example yogurt',        kcal: 60,  p: 10 },
  ex_banana:  { name: 'Example banana',        kcal: 90,  p: 1 },
  ex_chicken: { name: 'Example chicken',       kcal: 165, p: 31 },
  ex_rice:    { name: 'Example rice (dry)',    kcal: 360, p: 7 },
  ex_lentils: { name: 'Example lentils (dry)', kcal: 350, p: 25 },
  ex_eggs:    { name: 'Example eggs',          kcal: 143, p: 13 },
  ex_pb:      { name: 'Example peanut butter', kcal: 600, p: 25 },
};
const item = (id, grams) => ({
  name: ref[id].name, item_id: id, grams,
  kcal: Math.round(ref[id].kcal * grams / 100),
  protein_g: Math.round(ref[id].p * grams / 10) / 10,
});

const breakfast = { id: 'breakfast', time: '07:30', type: 'meal', title: 'Example breakfast bowl',
  items: [item('ex_oats', 80), item('ex_yogurt', 200), item('ex_banana', 120)] };
const lunch = { id: 'lunch', time: '12:30', type: 'meal', title: 'Example lunch box',
  items: [item('ex_chicken', 150), item('ex_rice', 90)] };
const dinner = { id: 'dinner', time: '19:30', type: 'meal', title: 'Example lentil stew with eggs', recipe_id: 'ex_stew',
  items: [item('ex_lentils', 80), item('ex_eggs', 100), item('ex_pb', 20)] };
const note = { id: 'note', time: '10:00', type: 'note', title: 'Example note: placeholder reminder text' };
const gym = { id: 'gym', time: '17:30', type: 'gym', title: 'Example session' };
const cook = { id: 'cook', time: '15:00', type: 'cook', title: 'Example batch cook: lentil stew', recipe_id: 'ex_stew',
  notes: 'Placeholder: makes the dinners for the next few days.' };
const freezer = { id: 'freezer', time: '21:00', type: 'freezer', title: 'Example: move 2 stew portions to the freezer' };

const start = new Date(Date.UTC(2026, 10, 2)); // 2 Nov 2026, Monday
const iso = (d) => d.toISOString().slice(0, 10);
const days = [];
const sessions = {};
for (let i = 0; i < 14; i++) {
  const d = new Date(start.getTime() + i * 86400000);
  const date = iso(d);
  const dow = d.getUTCDay(); // 1 Mon, 3 Wed, 5 Fri
  const gymDay = dow === 1 || dow === 3 || dow === 5;
  const slots = gymDay
    ? [breakfast, note, lunch, gym, dinner]
    : dow === 0 ? [breakfast, lunch, cook, dinner, freezer]
    : [breakfast, lunch, dinner];
  days.push({ date, slots: structuredClone(slots) });
  if (gymDay) {
    const week = Math.floor(i / 7);
    sessions[date] = {
      title: dow === 3 ? 'Example session B' : 'Example session A',
      exercises: dow === 3
        ? [
            { name: 'Example deadlift', sets: 3, reps: 5, load_kg: 80 + week * 5, notes: 'Placeholder note' },
            { name: 'Example overhead press', sets: 3, reps: 8, load_kg: 25 + week * 2.5 },
            { name: 'Example push-up', sets: 2, reps: 10, load_kg: null, notes: 'Bodyweight: no load logged' },
          ]
        : [
            { name: 'Example squat', sets: 3, reps: 5, load_kg: 60 + week * 5, notes: 'Placeholder note' },
            { name: 'Example bench press', sets: 3, reps: 8, load_kg: 40 + week * 2.5 },
            { name: 'Example row', sets: 3, reps: 10, load_kg: 30 },
          ],
    };
  }
}

const cycle = {
  schema_version: 1,
  meta: {
    example: true,
    cycle_name: 'EXAMPLE — not real data',
    start_date: iso(start),
    end_date: days[days.length - 1].date,
    daily_kcal_target: 1600,
    daily_protein_target_g: 120,
    bodyweight_start_kg: 70.0,
    bodyweight_target_kg: 72.0,
  },
  days,
  recipes: {
    ex_stew: {
      title: 'Example lentil stew',
      servings: 4,
      steps: [
        { text: 'Placeholder step: rinse the example lentils until the water runs clear.' },
        { text: 'Placeholder step: soften the example vegetables in a pot over medium heat.', timer_seconds: 300,
          doneness_test: 'Example test: vegetables are soft and translucent.' },
        { text: 'Placeholder step: add lentils and water, bring to a simmer.', timer_seconds: 1200,
          doneness_test: 'Example test: a lentil crushes easily against the side of the pot.' },
        { text: 'Placeholder step: boil the example eggs.', timer_seconds: 480,
          doneness_test: 'Example test: yolk is set when halved.' },
        { text: 'Placeholder step: portion into 4 example containers and cool.' },
      ],
    },
  },
  sessions,
  pantry: [
    { item_id: 'ex_oats',    name: 'Example oats',          quantity: 500,  unit: 'g',   source: 'counted',    as_of: '2026-11-01' },
    { item_id: 'ex_yogurt',  name: 'Example yogurt',        quantity: 1000, unit: 'g',   source: 'counted',    as_of: '2026-11-01' },
    { item_id: 'ex_chicken', name: 'Example chicken',       quantity: 600,  unit: 'g',   source: 'calculated', as_of: '2026-11-01' },
    { item_id: 'ex_rice',    name: 'Example rice (dry)',    quantity: 2000, unit: 'g',   source: 'counted',    as_of: '2026-11-01' },
    { item_id: 'ex_lentils', name: 'Example lentils (dry)', quantity: 400,  unit: 'g',   source: 'counted',    as_of: '2026-11-01' },
    { item_id: 'ex_eggs',    name: 'Example eggs',          quantity: 12,   unit: 'pcs', grams_per_unit: 50, source: 'counted', as_of: '2026-11-01' },
    { item_id: 'ex_pb',      name: 'Example peanut butter', quantity: 340,  unit: 'g',   source: 'calculated', as_of: '2026-10-30' },
  ],
  fun_equivalents: [
    { name: 'example grand piano', plural: 'example grand pianos', kg: 400, note: 'EXAMPLE — reference weights are rough approximations, not measurements.' },
    { name: 'example motorbike',   plural: 'example motorbikes',   kg: 200, note: 'EXAMPLE — reference weights are rough approximations, not measurements.' },
    { name: 'example sofa',        plural: 'example sofas',        kg: 80,  note: 'EXAMPLE — reference weights are rough approximations, not measurements.' },
    { name: 'example horse',       plural: 'example horses',       kg: 500, note: 'EXAMPLE — reference weights are rough approximations, not measurements.' },
  ],
};

const json = JSON.stringify(cycle, null, 2) + '\n';
writeFileSync(join(root, 'data/cycle.example.json'), json);
console.log('wrote data/cycle.example.json');
