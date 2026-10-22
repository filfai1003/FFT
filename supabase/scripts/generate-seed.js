// Generates supabase/seed.sql from the compact list below.
// Run: node supabase/scripts/generate-seed.js
const fs = require('fs');
const path = require('path');

// The 17 muscles (src/domain/muscles.ts, DECISIONS 125).
const MUSCLES = [
  'chest',
  'lats',
  'upper_back',
  'lower_back',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
  'abs',
  'obliques',
];

const words = (s) => (s ? s.split(' ').filter(Boolean) : []);

/**
 * One catalogue exercise. Muscles by how much the exercise works them (DECISIONS 125):
 * `primary` = 1 set per set done, `secondary` (space-separated) = half a set each (they help),
 * `indirect` = a quarter set each (they steady or assist a little).
 */
const E = (slug, name, equipment, log, primary, secondary = '', indirect = '') => ({
  slug,
  name,
  primary,
  secondary: words(secondary),
  indirect: words(indirect),
  equipment,
  log,
});

const W = 'weight_reps';
const R = 'reps';

// Levels follow the usual EMG / training-volume reading of each lift: the muscle that moves the
// load most is primary, the clear helpers secondary, stabilisers and small assistants indirect.
// prettier-ignore
const list = [
  //  slug                          name                              equipment     log              primary        secondary (½)                 indirect (¼)
  // chest
  E('bench-press',                 'Barbell bench press',            'barbell',    W,               'chest',       'front_delts triceps'),
  E('incline-bench-press',         'Incline barbell bench press',    'barbell',    W,               'chest',       'front_delts triceps'),
  E('decline-bench-press',         'Decline barbell bench press',    'barbell',    W,               'chest',       'triceps',                    'front_delts'),
  E('db-bench-press',              'Dumbbell bench press',           'dumbbells',  W,               'chest',       'front_delts triceps'),
  E('incline-db-press',            'Incline dumbbell press',         'dumbbells',  W,               'chest',       'front_delts triceps'),
  E('db-fly',                      'Dumbbell fly',                   'dumbbells',  W,               'chest',       '',                           'front_delts'),
  E('cable-fly',                   'Cable fly',                      'cables',     W,               'chest',       '',                           'front_delts'),
  E('pec-deck',                    'Pec deck',                       'machine',    W,               'chest',       '',                           'front_delts'),
  E('chest-press-machine',         'Chest press machine',            'machine',    W,               'chest',       'front_delts triceps'),
  E('push-up',                     'Push-up',                        'bodyweight', R,               'chest',       'front_delts triceps',        'abs'),
  E('chest-dip',                   'Chest dip',                      'bodyweight', R,               'chest',       'triceps front_delts'),
  // back
  E('pull-up',                     'Pull-up',                        'bodyweight', R,               'lats',        'biceps upper_back',          'rear_delts forearms'),
  E('chin-up',                     'Chin-up',                        'bodyweight', R,               'lats',        'biceps upper_back',          'forearms'),
  E('lat-pulldown',                'Lat pulldown',                   'cables',     W,               'lats',        'biceps upper_back',          'rear_delts forearms'),
  E('barbell-row',                 'Barbell row',                    'barbell',    W,               'upper_back',  'lats biceps rear_delts',     'lower_back forearms'),
  E('db-row',                      'One-arm dumbbell row',           'dumbbells',  W,               'lats',        'upper_back biceps',          'rear_delts forearms'),
  E('seated-cable-row',            'Seated cable row',               'cables',     W,               'upper_back',  'lats biceps',                'rear_delts forearms'),
  E('t-bar-row',                   'T-bar row',                      'barbell',    W,               'upper_back',  'lats biceps',                'rear_delts lower_back forearms'),
  E('chest-supported-row',         'Chest-supported row machine',    'machine',    W,               'upper_back',  'lats biceps',                'rear_delts'),
  E('straight-arm-pulldown',       'Straight-arm pulldown',          'cables',     W,               'lats',        '',                           'triceps abs'),
  E('face-pull',                   'Face pull',                      'cables',     W,               'rear_delts',  'upper_back',                 'side_delts'),
  E('deadlift',                    'Deadlift',                       'barbell',    W,               'lower_back',  'glutes hamstrings',          'quads upper_back forearms'),
  E('rack-pull',                   'Rack pull',                      'barbell',    W,               'lower_back',  'upper_back glutes',          'hamstrings forearms'),
  E('back-extension',              'Back extension',                 'bodyweight', R,               'lower_back',  'glutes hamstrings'),
  E('inverted-row',                'Inverted row',                   'bodyweight', R,               'upper_back',  'lats biceps',                'rear_delts abs'),
  // shoulders
  E('overhead-press',              'Overhead press',                 'barbell',    W,               'front_delts', 'triceps side_delts',         'upper_back abs'),
  E('seated-db-shoulder-press',    'Seated dumbbell shoulder press', 'dumbbells',  W,               'front_delts', 'triceps side_delts',         'upper_back'),
  E('arnold-press',                'Arnold press',                   'dumbbells',  W,               'front_delts', 'side_delts triceps',         'upper_back'),
  E('machine-shoulder-press',      'Machine shoulder press',         'machine',    W,               'front_delts', 'triceps side_delts'),
  E('lateral-raise',               'Lateral raise',                  'dumbbells',  W,               'side_delts',  '',                           'front_delts upper_back'),
  E('cable-lateral-raise',         'Cable lateral raise',            'cables',     W,               'side_delts',  '',                           'front_delts upper_back'),
  E('front-raise',                 'Front raise',                    'dumbbells',  W,               'front_delts', '',                           'side_delts chest'),
  E('rear-delt-fly',               'Rear delt fly',                  'dumbbells',  W,               'rear_delts',  'upper_back'),
  E('upright-row',                 'Upright row',                    'barbell',    W,               'side_delts',  'upper_back',                 'front_delts biceps'),
  E('db-shrug',                    'Dumbbell shrug',                 'dumbbells',  W,               'upper_back',  '',                           'forearms'),
  // biceps
  E('biceps-curl',                 'Dumbbell biceps curl',           'dumbbells',  W,               'biceps',      '',                           'forearms'),
  E('barbell-curl',                'Barbell curl',                   'barbell',    W,               'biceps',      '',                           'forearms'),
  E('hammer-curl',                 'Hammer curl',                    'dumbbells',  W,               'biceps',      'forearms'),
  E('incline-db-curl',             'Incline dumbbell curl',          'dumbbells',  W,               'biceps',      '',                           'forearms'),
  E('preacher-curl',               'Preacher curl',                  'machine',    W,               'biceps',      '',                           'forearms'),
  E('cable-curl',                  'Cable curl',                     'cables',     W,               'biceps',      '',                           'forearms'),
  // triceps
  E('pushdown',                    'Triceps pushdown',               'cables',     W,               'triceps'),
  E('rope-pushdown',               'Rope pushdown',                  'cables',     W,               'triceps'),
  E('skull-crusher',               'Skull crusher',                  'barbell',    W,               'triceps'),
  E('overhead-triceps-extension',  'Overhead triceps extension',     'dumbbells',  W,               'triceps'),
  E('close-grip-bench-press',      'Close-grip bench press',         'barbell',    W,               'triceps',     'chest front_delts'),
  E('bench-dip',                   'Bench dip',                      'bodyweight', R,               'triceps',     'front_delts',                'chest'),
  // legs
  E('back-squat',                  'Back squat',                     'barbell',    W,               'quads',       'glutes adductors',           'hamstrings lower_back'),
  E('front-squat',                 'Front squat',                    'barbell',    W,               'quads',       'glutes adductors',           'upper_back abs'),
  E('goblet-squat',                'Goblet squat',                   'dumbbells',  W,               'quads',       'glutes adductors',           'abs'),
  E('hack-squat',                  'Hack squat',                     'machine',    W,               'quads',       'glutes adductors'),
  E('leg-press',                   'Leg press',                      'machine',    W,               'quads',       'glutes adductors',           'hamstrings'),
  E('romanian-deadlift',           'Romanian deadlift',              'barbell',    W,               'hamstrings',  'glutes lower_back',          'adductors forearms'),
  E('leg-extension',               'Leg extension',                  'machine',    W,               'quads'),
  E('lying-leg-curl',              'Lying leg curl',                 'machine',    W,               'hamstrings',  '',                           'calves'),
  E('seated-leg-curl',             'Seated leg curl',                'machine',    W,               'hamstrings',  '',                           'calves'),
  E('walking-lunge',               'Walking lunge',                  'dumbbells',  W,               'quads',       'glutes',                     'adductors hamstrings'),
  E('bulgarian-split-squat',       'Bulgarian split squat',          'dumbbells',  W,               'quads',       'glutes',                     'adductors hamstrings'),
  E('standing-calf-raise',         'Standing calf raise',            'machine',    W,               'calves'),
  E('seated-calf-raise',           'Seated calf raise',              'machine',    W,               'calves'),
  // glutes
  E('hip-thrust',                  'Barbell hip thrust',             'barbell',    W,               'glutes',      'hamstrings',                 'quads adductors'),
  E('glute-bridge',                'Glute bridge',                   'bodyweight', R,               'glutes',      'hamstrings'),
  E('cable-kickback',              'Cable glute kickback',           'cables',     W,               'glutes',      '',                           'hamstrings'),
  // core
  E('plank',                       'Plank',                          'bodyweight', 'time',          'abs',         'obliques',                   'front_delts'),
  E('side-plank',                  'Side plank',                     'bodyweight', 'time',          'obliques',    'abs',                        'glutes side_delts'),
  E('crunch',                      'Crunch',                         'bodyweight', R,               'abs',         '',                           'obliques'),
  E('cable-crunch',                'Cable crunch',                   'cables',     W,               'abs',         '',                           'obliques'),
  E('hanging-leg-raise',           'Hanging leg raise',              'bodyweight', R,               'abs',         '',                           'obliques forearms'),
  E('ab-wheel-rollout',            'Ab wheel rollout',               'bodyweight', R,               'abs',         '',                           'obliques lats'),
  // conditioning
  E('treadmill-run',               'Treadmill run',                  'machine',    'distance_time', 'quads',       '',                           'calves hamstrings'),
  E('rowing-machine',              'Rowing machine',                 'machine',    'distance_time', 'upper_back',  'quads',                      'lats'),
  E('stationary-bike',             'Stationary bike',                'machine',    'distance_time', 'quads'),
];

// Every exercise names known muscles, each once (primary > secondary > indirect).
for (const e of list) {
  const all = [e.primary, ...e.secondary, ...e.indirect];
  for (const m of all) if (!MUSCLES.includes(m)) throw new Error(`${e.slug}: unknown muscle ${m}`);
  if (new Set(all).size !== all.length) throw new Error(`${e.slug}: a muscle is listed twice`);
}

// Slugs whose image exists in assets/exercise-images/<slug>.png (uploaded to the public bucket).
const withImage = new Set(
  fs
    .readdirSync(path.join(__dirname, '..', '..', 'assets', 'exercise-images'))
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.replace(/.png$/, '')),
);

if (new Set(list.map((e) => e.slug)).size !== list.length) throw new Error('duplicate slug');

/**
 * A stable UUID-shaped id per slug, the same on the server and in the app's on-device database
 * (src/lib/local-db/engine.ts `catalogueId`), so a plan moved between the two keeps its exercises.
 */
function catalogueId(slug) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < slug.length; i++) {
    h1 = Math.imul(h1 ^ slug.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + slug.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  return `ca7a1090-0000-4000-8000-${(hex(h1) + hex(h2)).slice(0, 12)}`;
}

const q = (s) => "'" + s.replace(/'/g, "''") + "'";
const arr = (a) => (a.length ? 'array[' + a.map(q).join(', ') + ']::text[]' : "'{}'::text[]");
const rows = list.map(
  (e) =>
    `  (${q(catalogueId(e.slug))}::uuid, ${q(e.slug)}, ${q(e.name)}, ${q(e.primary)}, ${arr(e.secondary)}, ${arr(e.indirect)}, ${q(e.equipment)}, ${q(e.log)}, ${withImage.has(e.slug) ? q(e.slug + '.png') : 'null'})`,
);

// Idempotent: the server (server/migrate.js) runs it at every start, so catalogue edits reach it.
const sql = [
  '-- Catalogue exercises (owner_id null). GENERATED by supabase/scripts/generate-seed.js: edit there.',
  "-- Images: upload '<slug>.png' to the public `exercise-images` bucket, then set image_path.",
  '-- Ids are derived from the slug (same as the app), so rows can move between device and server.',
  'drop table if exists pg_temp.catalogue_seed;',
  'create temporary table catalogue_seed (id uuid, slug text, name text, primary_muscle text,',
  '  secondary_muscles text[], indirect_muscles text[], equipment text, log_type text,',
  '  image_path text);',
  'insert into catalogue_seed values',
  rows.join(',\n') + ';',
  '',
  '-- Rows seeded before the ids were stable get the stable id (they are referenced by nobody yet).',
  'update public.exercises e set id = s.id',
  '  from catalogue_seed s',
  '  where e.owner_id is null and e.slug = s.slug and e.id <> s.id',
  '    and not exists (select 1 from public.plan_exercises p where p.exercise_id = e.id)',
  '    and not exists (select 1 from public.session_exercises p where p.exercise_id = e.id)',
  '    and not exists (select 1 from public.session_sets p where p.exercise_id = e.id);',
  '',
  'insert into public.exercises (id, slug, name, primary_muscle, secondary_muscles, indirect_muscles,',
  '  equipment, log_type, image_path)',
  'select id, slug, name, primary_muscle, secondary_muscles, indirect_muscles, equipment, log_type,',
  '  image_path from catalogue_seed',
  'on conflict (id) do update set',
  '  name = excluded.name, primary_muscle = excluded.primary_muscle,',
  '  secondary_muscles = excluded.secondary_muscles, indirect_muscles = excluded.indirect_muscles,',
  '  equipment = excluded.equipment,',
  '  log_type = excluded.log_type, image_path = excluded.image_path;',
  '',
  'drop table catalogue_seed;',
  '',
].join('\n');

// --- Generic foods (CIQUAL, see import-ciqual.js) ------------------------------------------------
// Same ids on the server and in the app (logged foods point to them, and premium logs are synced).
const genericFoods = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'generic-foods.json'), 'utf8'),
);
const genericFoodId = (code) => `cf000000-0000-4000-8000-${String(code).padStart(12, '0')}`;
const num = (v) => (v == null ? 'null' : String(v));
const foodRows = genericFoods.map(
  (f) =>
    `  (${q(genericFoodId(f.code))}::uuid, ${q(f.name)}, ${num(f.kcal)}, ${num(f.protein)}, ${num(f.carbs)}, ${num(f.sugars)}, ${num(f.fat)}, ${num(f.saturates)}, ${num(f.fiber)}, ${num(f.salt)})`,
);
const foodsSql = [
  '',
  '-- Generic foods (fruit, vegetables, meat, fish, grains, dairy…) per 100 g, from the CIQUAL table',
  '-- (ANSES, Etalab Open Licence 2.0: "Ciqual (ANSES)"). GENERATED from supabase/data/generic-foods.json.',
  'drop table if exists pg_temp.generic_food_seed;',
  'create temporary table generic_food_seed (id uuid, name text, kcal numeric, protein numeric,',
  '  carbs numeric, sugars numeric, fat numeric, saturates numeric, fiber numeric, salt numeric);',
  'insert into generic_food_seed values',
  foodRows.join(',\n') + ';',
  '',
  'insert into public.foods (id, owner_id, name, kcal_100g, protein_100g, carbs_100g, sugars_100g,',
  '  fat_100g, saturates_100g, fiber_100g, salt_100g, source, verified)',
  "select id, null, name, kcal, protein, carbs, sugars, fat, saturates, fiber, salt, 'ciqual', true",
  '  from generic_food_seed',
  'on conflict (id) do update set',
  '  name = excluded.name, kcal_100g = excluded.kcal_100g, protein_100g = excluded.protein_100g,',
  '  carbs_100g = excluded.carbs_100g, sugars_100g = excluded.sugars_100g, fat_100g = excluded.fat_100g,',
  '  saturates_100g = excluded.saturates_100g, fiber_100g = excluded.fiber_100g,',
  '  salt_100g = excluded.salt_100g;',
  '',
  'drop table generic_food_seed;',
  '',
].join('\n');

fs.writeFileSync(path.join(__dirname, '..', 'seed.sql'), sql + foodsSql);
console.log(genericFoods.length + ' generic foods written to supabase/seed.sql');

// The app keeps them in a compact table (rows are built on first use: see local-db/generic-foods.ts).
const foodsTs = [
  '// GENERATED by supabase/scripts/generate-seed.js from supabase/data/generic-foods.json (CIQUAL,',
  '// ANSES, Etalab Open Licence 2.0). Do not edit: re-run `npm run db:seed`.',
  '',
  '/** [code, name, kcal, protein, carbs, sugars, fat, saturates, fiber, salt] per 100 g. */',
  'export type GenericFood = [',
  '  number,',
  '  string,',
  '  number,',
  '  number,',
  '  number,',
  '  number | null,',
  '  number,',
  '  number | null,',
  '  number | null,',
  '  number | null,',
  '];',
  '',
  'export const genericFoodTable: GenericFood[] = [',
  ...genericFoods.map(
    (f) =>
      `  [${f.code}, ${JSON.stringify(f.name)}, ${num(f.kcal)}, ${num(f.protein)}, ${num(f.carbs)}, ${num(f.sugars)}, ${num(f.fat)}, ${num(f.saturates)}, ${num(f.fiber)}, ${num(f.salt)}],`,
  ),
  '];',
  '',
].join('\n');
fs.writeFileSync(
  path.join(__dirname, '..', '..', 'src', 'lib', 'local-db', 'generic-food-table.ts'),
  foodsTs,
);
console.log(list.length + ' exercises written to supabase/seed.sql');

// The same catalogue for the offline mode (the app seeds its on-device database from it), with the
// bundled images (Metro needs static require() paths).
const tsPath = path.join(__dirname, '..', '..', 'src', 'lib', 'local-db', 'catalogue.ts');
const images = [...withImage].sort();
const ts = [
  '// GENERATED by supabase/scripts/generate-seed.js: edit the list there, then run `npm run db:seed`.',
  '',
  'export type CatalogueExercise = {',
  '  slug: string;',
  '  name: string;',
  '  primary: string;',
  '  secondary: string[];',
  '  indirect: string[];',
  '  equipment: string;',
  '  log: string;',
  '  image: string | null;',
  '};',
  '',
  'export const catalogue: CatalogueExercise[] = ' +
    JSON.stringify(
      list.map((e) => ({ ...e, image: withImage.has(e.slug) ? e.slug + '.png' : null })),
      null,
      2,
    ) +
    ';',
  '',
  '/** Images bundled with the app, by the file name stored in `image_path`. */',
  'export const catalogueImages: Record<string, number> = {',
  ...images.map((s) => `  '${s}.png': require('../../../assets/exercise-images/${s}.png'),`),
  '};',
  '',
].join('\n');
fs.writeFileSync(tsPath, ts);
console.log('offline catalogue written to src/lib/local-db/catalogue.ts');
