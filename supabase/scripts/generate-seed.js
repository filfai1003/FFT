// Generates supabase/seed.sql from the compact list below.
// Run: node supabase/scripts/generate-seed.js
const fs = require('fs');
const path = require('path');

const E = (slug, name, primary, secondary, equipment, log = 'weight_reps') => ({
  slug,
  name,
  primary,
  secondary,
  equipment,
  log,
});

const list = [
  // chest
  E('bench-press', 'Barbell bench press', 'chest', ['shoulders', 'triceps'], 'barbell'),
  E(
    'incline-bench-press',
    'Incline barbell bench press',
    'chest',
    ['shoulders', 'triceps'],
    'barbell',
  ),
  E('decline-bench-press', 'Decline barbell bench press', 'chest', ['triceps'], 'barbell'),
  E('db-bench-press', 'Dumbbell bench press', 'chest', ['shoulders', 'triceps'], 'dumbbells'),
  E('incline-db-press', 'Incline dumbbell press', 'chest', ['shoulders', 'triceps'], 'dumbbells'),
  E('db-fly', 'Dumbbell fly', 'chest', ['shoulders'], 'dumbbells'),
  E('cable-fly', 'Cable fly', 'chest', ['shoulders'], 'cables'),
  E('pec-deck', 'Pec deck', 'chest', [], 'machine'),
  E('chest-press-machine', 'Chest press machine', 'chest', ['shoulders', 'triceps'], 'machine'),
  E('push-up', 'Push-up', 'chest', ['shoulders', 'triceps'], 'bodyweight', 'reps'),
  E('chest-dip', 'Chest dip', 'chest', ['triceps', 'shoulders'], 'bodyweight', 'reps'),
  // back
  E('pull-up', 'Pull-up', 'back', ['biceps'], 'bodyweight', 'reps'),
  E('chin-up', 'Chin-up', 'back', ['biceps'], 'bodyweight', 'reps'),
  E('lat-pulldown', 'Lat pulldown', 'back', ['biceps'], 'cables'),
  E('barbell-row', 'Barbell row', 'back', ['biceps', 'shoulders'], 'barbell'),
  E('db-row', 'One-arm dumbbell row', 'back', ['biceps'], 'dumbbells'),
  E('seated-cable-row', 'Seated cable row', 'back', ['biceps'], 'cables'),
  E('t-bar-row', 'T-bar row', 'back', ['biceps'], 'barbell'),
  E('chest-supported-row', 'Chest-supported row machine', 'back', ['biceps'], 'machine'),
  E('straight-arm-pulldown', 'Straight-arm pulldown', 'back', [], 'cables'),
  E('face-pull', 'Face pull', 'back', ['shoulders'], 'cables'),
  E('deadlift', 'Deadlift', 'back', ['legs', 'glutes'], 'barbell'),
  E('rack-pull', 'Rack pull', 'back', ['glutes'], 'barbell'),
  E('back-extension', 'Back extension', 'back', ['glutes', 'legs'], 'bodyweight', 'reps'),
  E('inverted-row', 'Inverted row', 'back', ['biceps'], 'bodyweight', 'reps'),
  // shoulders
  E('overhead-press', 'Overhead press', 'shoulders', ['triceps'], 'barbell'),
  E(
    'seated-db-shoulder-press',
    'Seated dumbbell shoulder press',
    'shoulders',
    ['triceps'],
    'dumbbells',
  ),
  E('arnold-press', 'Arnold press', 'shoulders', ['triceps'], 'dumbbells'),
  E('machine-shoulder-press', 'Machine shoulder press', 'shoulders', ['triceps'], 'machine'),
  E('lateral-raise', 'Lateral raise', 'shoulders', [], 'dumbbells'),
  E('cable-lateral-raise', 'Cable lateral raise', 'shoulders', [], 'cables'),
  E('front-raise', 'Front raise', 'shoulders', [], 'dumbbells'),
  E('rear-delt-fly', 'Rear delt fly', 'shoulders', ['back'], 'dumbbells'),
  E('upright-row', 'Upright row', 'shoulders', ['biceps'], 'barbell'),
  E('db-shrug', 'Dumbbell shrug', 'shoulders', ['back'], 'dumbbells'),
  // biceps
  E('biceps-curl', 'Dumbbell biceps curl', 'biceps', [], 'dumbbells'),
  E('barbell-curl', 'Barbell curl', 'biceps', [], 'barbell'),
  E('hammer-curl', 'Hammer curl', 'biceps', [], 'dumbbells'),
  E('incline-db-curl', 'Incline dumbbell curl', 'biceps', [], 'dumbbells'),
  E('preacher-curl', 'Preacher curl', 'biceps', [], 'machine'),
  E('cable-curl', 'Cable curl', 'biceps', [], 'cables'),
  // triceps
  E('pushdown', 'Triceps pushdown', 'triceps', [], 'cables'),
  E('rope-pushdown', 'Rope pushdown', 'triceps', [], 'cables'),
  E('skull-crusher', 'Skull crusher', 'triceps', [], 'barbell'),
  E('overhead-triceps-extension', 'Overhead triceps extension', 'triceps', [], 'dumbbells'),
  E(
    'close-grip-bench-press',
    'Close-grip bench press',
    'triceps',
    ['chest', 'shoulders'],
    'barbell',
  ),
  E('bench-dip', 'Bench dip', 'triceps', ['shoulders'], 'bodyweight', 'reps'),
  // legs
  E('back-squat', 'Back squat', 'legs', ['glutes', 'abs'], 'barbell'),
  E('front-squat', 'Front squat', 'legs', ['glutes', 'abs'], 'barbell'),
  E('goblet-squat', 'Goblet squat', 'legs', ['glutes'], 'dumbbells'),
  E('hack-squat', 'Hack squat', 'legs', ['glutes'], 'machine'),
  E('leg-press', 'Leg press', 'legs', ['glutes'], 'machine'),
  E('romanian-deadlift', 'Romanian deadlift', 'legs', ['glutes', 'back'], 'barbell'),
  E('leg-extension', 'Leg extension', 'legs', [], 'machine'),
  E('lying-leg-curl', 'Lying leg curl', 'legs', [], 'machine'),
  E('seated-leg-curl', 'Seated leg curl', 'legs', [], 'machine'),
  E('walking-lunge', 'Walking lunge', 'legs', ['glutes'], 'dumbbells'),
  E('bulgarian-split-squat', 'Bulgarian split squat', 'legs', ['glutes'], 'dumbbells'),
  E('standing-calf-raise', 'Standing calf raise', 'legs', [], 'machine'),
  E('seated-calf-raise', 'Seated calf raise', 'legs', [], 'machine'),
  // glutes
  E('hip-thrust', 'Barbell hip thrust', 'glutes', ['legs'], 'barbell'),
  E('glute-bridge', 'Glute bridge', 'glutes', ['legs'], 'bodyweight', 'reps'),
  E('cable-kickback', 'Cable glute kickback', 'glutes', [], 'cables'),
  // abs
  E('plank', 'Plank', 'abs', ['shoulders'], 'bodyweight', 'time'),
  E('side-plank', 'Side plank', 'abs', ['shoulders'], 'bodyweight', 'time'),
  E('crunch', 'Crunch', 'abs', [], 'bodyweight', 'reps'),
  E('cable-crunch', 'Cable crunch', 'abs', [], 'cables'),
  E('hanging-leg-raise', 'Hanging leg raise', 'abs', [], 'bodyweight', 'reps'),
  E('ab-wheel-rollout', 'Ab wheel rollout', 'abs', ['shoulders'], 'bodyweight', 'reps'),
  // conditioning
  E('treadmill-run', 'Treadmill run', 'legs', [], 'machine', 'distance_time'),
  E('rowing-machine', 'Rowing machine', 'back', ['legs'], 'machine', 'distance_time'),
  E('stationary-bike', 'Stationary bike', 'legs', [], 'machine', 'distance_time'),
];

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
    `  (${q(catalogueId(e.slug))}::uuid, ${q(e.slug)}, ${q(e.name)}, ${q(e.primary)}, ${arr(e.secondary)}, ${q(e.equipment)}, ${q(e.log)}, ${withImage.has(e.slug) ? q(e.slug + '.png') : 'null'})`,
);

// Idempotent: the server (server/migrate.js) runs it at every start, so catalogue edits reach it.
const sql = [
  '-- Catalogue exercises (owner_id null). GENERATED by supabase/scripts/generate-seed.js: edit there.',
  "-- Images: upload '<slug>.png' to the public `exercise-images` bucket, then set image_path.",
  '-- Ids are derived from the slug (same as the app), so rows can move between device and server.',
  'drop table if exists pg_temp.catalogue_seed;',
  'create temporary table catalogue_seed (id uuid, slug text, name text, primary_muscle text,',
  '  secondary_muscles text[], equipment text, log_type text, image_path text);',
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
  'insert into public.exercises (id, slug, name, primary_muscle, secondary_muscles, equipment, log_type, image_path)',
  'select id, slug, name, primary_muscle, secondary_muscles, equipment, log_type, image_path from catalogue_seed',
  'on conflict (id) do update set',
  '  name = excluded.name, primary_muscle = excluded.primary_muscle,',
  '  secondary_muscles = excluded.secondary_muscles, equipment = excluded.equipment,',
  '  log_type = excluded.log_type, image_path = excluded.image_path;',
  '',
  'drop table catalogue_seed;',
  '',
].join('\n');

fs.writeFileSync(path.join(__dirname, '..', 'seed.sql'), sql);
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
