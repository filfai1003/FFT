import { useEffect } from 'react';
import { useAppearanceStore, type AppearanceState } from '@/design/appearance-store';
import { getSupabase } from '@/lib/supabase';
import { useSessionStore } from '@/features/auth/session-store';
import { rowToState, stateToRow } from './mapping';
import { usePreferencesStore, type Preferences } from './preferences-store';

const SAVE_DELAY_MS = 600;

function currentAppearance(): AppearanceState {
  const { set: _set, reset: _reset, ...state } = useAppearanceStore.getState();
  return state;
}

function currentPreferences(): Preferences {
  const { set: _set, replace: _replace, ...state } = usePreferencesStore.getState();
  return state;
}

/**
 * Keeps the accessibility/units stores and the user_settings row in step: loads the row after
 * sign-in, then saves changes (debounced). Mount once while signed in.
 */
export function useSettingsSync() {
  const userId = useSessionStore((s) => s.userId);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loaded = false;
    const unsubscribers: (() => void)[] = [];

    const save = () => {
      if (!loaded) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void getSupabase()
          .from('user_settings')
          .update(stateToRow(currentAppearance(), currentPreferences()))
          .eq('user_id', userId);
      }, SAVE_DELAY_MS);
    };

    void getSupabase()
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          const { appearance, prefs } = rowToState(data);
          useAppearanceStore.setState(appearance);
          usePreferencesStore.getState().replace(prefs);
        }
        loaded = true;
        unsubscribers.push(useAppearanceStore.subscribe(save), usePreferencesStore.subscribe(save));
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribers.forEach((u) => u());
    };
  }, [userId]);
}
