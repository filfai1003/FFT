/**
 * Supersets (DECISIONS 53): an exercise can be linked with the next one (`supersetWithNext`);
 * consecutive links make one superset (A1 + A2, or three or more in a row). The exercises of a
 * superset are done in turn: a set of each, then the rest, then the next round.
 */

/** Indices of the superset that `index` belongs to ([index] alone when it has none). */
export function supersetOf(links: readonly boolean[], index: number): number[] {
  let start = index;
  while (start > 0 && links[start - 1]) start--;
  let end = index;
  while (end < links.length - 1 && links[end]) end++;
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/** The label of each exercise: "A1", "A2", "B1"… for supersets, null for the others. */
export function supersetLabels(links: readonly boolean[]): (string | null)[] {
  const labels: (string | null)[] = [];
  let letter = 0;
  for (let i = 0; i < links.length; i++) {
    const group = supersetOf(links, i);
    if (group.length < 2) {
      labels.push(null);
      continue;
    }
    const pos = i - group[0];
    if (pos === 0 && i > 0) letter += labels.some((l) => l != null) ? 1 : 0;
    labels.push(`${String.fromCharCode(65 + letter)}${pos + 1}`);
  }
  return labels;
}

/**
 * What happens after a set of `index` is done: go to the next exercise of the superset with no
 * rest, or (the last one) rest and go back to the first exercise that still has sets to do.
 */
export function afterSetInSuperset(
  links: readonly boolean[],
  index: number,
  setsLeft: readonly number[],
): { goTo: number | null; rest: boolean } {
  const group = supersetOf(links, index);
  if (group.length < 2) return { goTo: null, rest: true };
  const pos = group.indexOf(index);
  // The next exercise of the round that still has a set to do.
  for (const i of group.slice(pos + 1)) if (setsLeft[i] > 0) return { goTo: i, rest: false };
  // End of the round: rest, then start the next one.
  const first = group.find((i) => setsLeft[i] > 0);
  return { goTo: first != null && first !== index ? first : null, rest: true };
}
