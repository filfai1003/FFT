// Imports the generic foods (fruit, vegetables, meat, fish, grains, dairy…) from the CIQUAL table
// (ANSES, Etalab Open Licence 2.0: free to reuse, cite "Ciqual (ANSES)") into
// supabase/data/generic-foods.json. Then `npm run db:seed` puts them in the app and on the server.
//
// Download the XML table from https://ciqual.anses.fr (e.g. XML_2020_07_07.zip), unzip it and run:
//   node supabase/scripts/import-ciqual.js <folder with alim_*.xml and compo_*.xml>
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) throw new Error('Usage: node import-ciqual.js <unzipped CIQUAL XML folder>');
const find = (prefix) => {
  const f = fs.readdirSync(dir).find((n) => n.startsWith(prefix) && n.endsWith('.xml'));
  if (!f) throw new Error(`${prefix}*.xml not found in ${dir}`);
  return path.join(dir, f);
};
// The files are windows-1252; latin1 reads the letters used in the names correctly.
const read = (file) => fs.readFileSync(file, 'latin1');
const field = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].trim() : '';
};

// Nutrient codes of the table -> our columns (per 100 g).
const NUTRIENTS = {
  328: 'kcal', // Energy, Regulation EU No 1169/2011 (kcal/100g)
  333: 'kcalJones', // Energy, N x Jones' factor, with fibres (kcal/100g): when 328 is missing
  25000: 'protein',
  31000: 'carbs',
  32000: 'sugars',
  40000: 'fat',
  40302: 'saturates',
  34100: 'fiber',
  10004: 'salt',
};

/** "12,5" -> 12.5; "traces" or "< 0,5" -> 0; "-" (not measured) -> null. */
function value(text) {
  const t = text.replace(/&lt;/g, '<').trim();
  if (t === '' || t === '-') return null;
  if (/^traces$/i.test(t) || t.startsWith('<')) return 0;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const foods = new Map();
for (const block of read(find('alim_')).split('</ALIM>')) {
  const code = field(block, 'alim_code');
  const name = field(block, 'alim_nom_eng').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const group = field(block, 'alim_grp_code');
  // 11 = baby food: not useful in a training and diet app.
  if (!code || !name || group === '11') continue;
  foods.set(code, { code: Number(code), name: name[0].toUpperCase() + name.slice(1) });
}

const compo = read(find('compo_'));
const re = /<alim_code>\s*(\d+)\s*<\/alim_code>\s*<const_code>\s*(\d+)\s*<\/const_code>\s*<teneur>(.*?)<\/teneur>/g; // values like "< 0,5" are not escaped
for (let m; (m = re.exec(compo)); ) {
  const food = foods.get(m[1]);
  const key = NUTRIENTS[m[2]];
  if (food && key) food[key] = value(m[3]);
}

// Energy: the EU value, else the other measured one, else worked out from the macros.
for (const f of foods.values()) {
  if (f.kcal == null) f.kcal = f.kcalJones ?? null;
  if (f.kcal == null && f.protein != null && f.carbs != null && f.fat != null)
    f.kcal = Math.round(4 * f.protein + 4 * f.carbs + 9 * f.fat + 2 * (f.fiber ?? 0));
}

// Only foods with energy and the three macros can be logged meaningfully.
const out = [...foods.values()]
  .filter((f) => f.kcal != null && f.protein != null && f.carbs != null && f.fat != null)
  .sort((a, b) => a.code - b.code)
  .map((f) => ({
    code: f.code,
    name: f.name.slice(0, 160),
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    sugars: f.sugars ?? null,
    fat: f.fat,
    saturates: f.saturates ?? null,
    fiber: f.fiber ?? null,
    salt: f.salt ?? null,
  }));

const target = path.join(__dirname, '..', 'data', 'generic-foods.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log(`${out.length} generic foods (of ${foods.size}) written to supabase/data/generic-foods.json`);
