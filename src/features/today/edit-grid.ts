import type { WidgetId, WidgetItem } from './layout-store';

/**
 * The Today grid as rows, like a phone's home screen (DECISIONS 106): a wide card fills a row, a
 * half-width card sits in the left or right slot of a row, and a slot can stay empty.
 */
export type GridRow =
  { kind: 'large'; id: WidgetId } | { kind: 'pair'; left?: WidgetId; right?: WidgetId };

/** A row's place on screen, relative to the grid. */
export type RowBand = { top: number; height: number };

/** A card's place on screen, relative to the grid. */
export type CardBox = { x: number; y: number; w: number };

export type GridGeometry = {
  boxes: Map<WidgetId, CardBox>;
  bands: RowBand[];
  /** Height of the whole grid. */
  height: number;
  /** Height of each half-width card's row (the shorter card of a pair stretches to it). */
  rowHeight: Map<WidgetId, number>;
};

/** Height used for a card not measured yet. */
const UNMEASURED = 120;

/**
 * Rows from the shown cards, in order. A half-width card with a column (`col`) goes to that slot:
 * after the left slot it may share the row, otherwise it starts a new one (so an empty slot can be
 * left on purpose); without one it takes the next free slot.
 */
export function packRows(shown: readonly WidgetItem[]): GridRow[] {
  const rows: GridRow[] = [];
  let open: Extract<GridRow, { kind: 'pair' }> | null = null;
  for (const w of shown) {
    if (w.size === 'large') {
      open = null;
      rows.push({ kind: 'large', id: w.id });
      continue;
    }
    if (open && open.left && !open.right && w.col !== 0) {
      open.right = w.id;
      open = null;
      continue;
    }
    const row: Extract<GridRow, { kind: 'pair' }> =
      w.col === 1 ? { kind: 'pair', right: w.id } : { kind: 'pair', left: w.id };
    rows.push(row);
    open = w.col === 1 ? null : row;
  }
  return rows;
}

/** The shown cards back from rows, in reading order, each half-width card with its slot. */
export function rowsToShown(rows: readonly GridRow[], shown: readonly WidgetItem[]): WidgetItem[] {
  const byId = new Map(shown.map((w) => [w.id, w]));
  const out: WidgetItem[] = [];
  const put = (id: WidgetId | undefined, col?: 0 | 1) => {
    const w = id ? byId.get(id) : undefined;
    if (!w) return;
    const { col: _old, ...rest } = w;
    out.push(col === undefined ? rest : { ...rest, col });
  };
  for (const r of rows) {
    if (r.kind === 'large') put(r.id);
    else {
      put(r.left, 0);
      put(r.right, 1);
    }
  }
  return out;
}

/** The ids of a row, left to right. */
export function rowIds(r: GridRow): WidgetId[] {
  if (r.kind === 'large') return [r.id];
  return [r.left, r.right].filter((id): id is WidgetId => id != null);
}

/** Where every card goes, from the rows, the grid width and the cards' measured heights. */
export function gridGeometry(
  rows: readonly GridRow[],
  width: number,
  gap: number,
  heights: ReadonlyMap<WidgetId, number>,
): GridGeometry {
  const half = (width - gap) / 2;
  const boxes = new Map<WidgetId, CardBox>();
  const rowHeight = new Map<WidgetId, number>();
  const bands: RowBand[] = [];
  let top = 0;
  for (const r of rows) {
    const ids = rowIds(r);
    const height = Math.max(...ids.map((id) => heights.get(id) ?? UNMEASURED));
    if (r.kind === 'large') boxes.set(r.id, { x: 0, y: top, w: width });
    else {
      if (r.left) boxes.set(r.left, { x: 0, y: top, w: half });
      if (r.right) boxes.set(r.right, { x: half + gap, y: top, w: half });
      for (const id of ids) rowHeight.set(id, height);
    }
    bands.push({ top, height });
    top += height + gap;
  }
  return { boxes, bands, height: Math.max(0, top - gap), rowHeight };
}

/**
 * The rows once `dragged` is let go with its centre at (cx, cy), worked out from the rows and
 * places at the start of the drag (so the answer does not flicker while the others move):
 * - a half-width card takes the left or right slot of the row under it; the card already there
 *   moves to the other slot if it is free, else down to the same slot of the next row (a new row
 *   when that one is taken too); over a wide card it gets a new row above or below it;
 * - a wide card gets a new row above or below the row under it;
 * - above the first row or below the last, a new first or last row;
 * - over its own place nothing changes.
 */
export function dropRows(
  rows: readonly GridRow[],
  bands: readonly RowBand[],
  dragged: WidgetItem,
  cx: number,
  cy: number,
  width: number,
): GridRow[] {
  const from = rows.findIndex((r) => rowIds(r).includes(dragged.id));
  if (from < 0 || bands.length !== rows.length) return [...rows];
  const fromRow = rows[from]!;
  const fromCol = fromRow.kind === 'pair' && fromRow.right === dragged.id ? 1 : 0;
  const col: 0 | 1 = cx < width / 2 ? 0 : 1;
  const key = col === 0 ? 'left' : 'right';
  const other = col === 0 ? 'right' : 'left';

  // Which row, and whether in its upper or lower half (before the first / after the last row).
  const last = bands.length - 1;
  let at = bands.findIndex(
    (b, i) => i === last || cy < b.top + b.height + (bands[i + 1]!.top - b.top - b.height) / 2,
  );
  let lower = cy > bands[at]!.top + bands[at]!.height / 2;
  const before = cy < bands[0]!.top;
  const after = cy > bands[last]!.top + bands[last]!.height;
  if (before) {
    at = 0;
    lower = false;
  } else if (after) {
    at = last;
    lower = true;
  }

  if (!before && !after && at === from && (dragged.size === 'large' || col === fromCol))
    return [...rows];

  // The rows without the dragged card (its row may become empty; empty rows go at the end).
  const next: GridRow[] = rows.map((r) => ({ ...r }));
  const own = next[from]!;
  if (own.kind === 'large') next[from] = { kind: 'pair' };
  else if (own.left === dragged.id) delete own.left;
  else delete own.right;

  const target = next[at]!;
  const newRow = (): GridRow =>
    dragged.size === 'large'
      ? { kind: 'large', id: dragged.id }
      : { kind: 'pair', [key]: dragged.id };

  if (dragged.size === 'large' || target.kind === 'large' || before || after) {
    next.splice(lower ? at + 1 : at, 0, newRow());
  } else {
    const taken = target[key];
    target[key] = dragged.id;
    if (taken) {
      if (!target[other]) target[other] = taken;
      else {
        const below = next[at + 1];
        if (below && below.kind === 'pair' && !below[key]) below[key] = taken;
        else next.splice(at + 1, 0, { kind: 'pair', [key]: taken });
      }
    }
  }
  return next.filter((r) => rowIds(r).length > 0);
}

/** A key for comparing two arrangements. */
export function rowsKey(rows: readonly GridRow[]): string {
  return rows
    .map((r) => (r.kind === 'large' ? r.id : `${r.left ?? '_'}|${r.right ?? '_'}`))
    .join(',');
}
