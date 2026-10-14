import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';

/** Where the old Home "Creatine" widget kept its ticks (one list of days, on this device). */
const OLD_KEY = 'fft.creatine-days';

/**
 * The old Creatine widget became Supplements: its days become ticks of a "Creatine" supplement
 * (created if the list has none), then the old list is removed. Runs once; true if it moved any.
 */
export async function migrateCreatineDays(userId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(OLD_KEY).catch(() => null);
  if (!raw) return false;
  let days: string[] = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed))
      days = parsed.filter(
        (d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d),
      );
  } catch {
    days = [];
  }
  if (days.length > 0) {
    const db = getSupabase();
    const existing = await db.from('supplements').select('id, name').is('deleted_at', null);
    if (existing.error) return false;
    let id = existing.data.find((s) => /creatin/i.test(s.name))?.id;
    if (!id) {
      id = newId();
      const made = await db
        .from('supplements')
        .insert({ id, user_id: userId, name: 'Creatine', position: existing.data.length });
      if (made.error) return false;
    }
    for (const day of days) {
      const res = await db
        .from('supplement_logs')
        .insert({ id: newId(), user_id: userId, day, supplement_id: id });
      if (res.error && res.error.code !== '23505') return false;
    }
  }
  await AsyncStorage.removeItem(OLD_KEY).catch(() => undefined);
  return days.length > 0;
}
