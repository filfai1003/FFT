import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Badges whose "Badge earned" sheet was already shown, per account, on this device. Only a UI
 * convenience (DECISIONS 89): badges themselves are computed from the data, so another phone may
 * show the sheet once more, and nothing is lost if this is cleared.
 */
const key = (userId: string) => `fft.badges-seen.${userId}`;

/** Null = never stored on this device (first run: everything earned so far counts as seen). */
export async function loadSeenBadges(userId: string): Promise<Set<string> | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (raw == null) return null;
    const list = JSON.parse(raw) as unknown;
    return new Set(
      Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [],
    );
  } catch {
    return null;
  }
}

export async function saveSeenBadges(userId: string, ids: Iterable<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify([...new Set(ids)]));
  } catch {
    // Not saved: the sheet may show again later, nothing else.
  }
}

/**
 * Which badge to celebrate: the newest earned one not seen yet (and how many others came with
 * it). On the first run nothing is shown: a history that already earned badges is not a flood.
 */
export function badgeToCelebrate(
  earned: readonly { id: string; earnedOn: string | null }[],
  seen: ReadonlySet<string> | null,
): { id: string; others: number } | null {
  if (seen == null) return null;
  const fresh = earned
    .filter((b) => !seen.has(b.id))
    .sort((a, b) => (b.earnedOn ?? '').localeCompare(a.earnedOn ?? ''));
  return fresh[0] ? { id: fresh[0].id, others: fresh.length - 1 } : null;
}
