/**
 * A Map with a size limit for the in-memory limits and lockouts (DECISIONS 97). Past the limit it
 * first drops the entries that no longer matter (`stale(value)`), then the least recently used
 * ones, one at a time: flooding it with new keys pushes out old, quiet entries only, never all of
 * them at once (a full `clear()` used to forget every lockout).
 */
export function boundedMap(max, stale = () => false) {
  const map = new Map();
  return {
    get(key) {
      const v = map.get(key);
      if (v !== undefined) {
        // Most recently used goes to the end (Map keeps insertion order).
        map.delete(key);
        map.set(key, v);
      }
      return v;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, value);
      if (map.size <= max) return;
      for (const [k, v] of map) {
        if (map.size <= max) return;
        if (stale(v)) map.delete(k);
      }
      while (map.size > max) map.delete(map.keys().next().value);
    },
    delete(key) {
      map.delete(key);
    },
    get size() {
      return map.size;
    },
  };
}
