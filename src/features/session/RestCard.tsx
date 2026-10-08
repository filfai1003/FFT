import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import * as Speech from 'expo-speech';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Text } from '@/components/ui/Text';
import { touch } from '@/design/tokens';
import { useAppearanceStore } from '@/design/appearance-store';
import { useTheme } from '@/design/use-theme';
import { confirm } from '@/lib/haptics';
import { cancelRestEnd, scheduleRestEnd } from '@/lib/notifications';
import { useNow } from '@/lib/use-now';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { adjustRest, formatClock, restRemainingS } from './logic';
import { useSessionStore } from './store';

const BAR_DOTS = 24;

/** Rest timer after a set: counts down, ±15 s, skip; vibrates (and speaks 10…1) when done. */
export function RestCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rest = useSessionStore((s) => s.active?.rest ?? null);
  const update = useSessionStore((s) => s.update);
  const spoken = useAppearanceStore((s) => s.spokenCountdown);
  const now = useNow(250, rest != null);
  const lastSpoken = useRef<number | null>(null);
  const restAlerts = usePreferencesStore((st) => st.notifications.rest_timer);
  const endsAt = rest?.endsAt ?? null;

  // A notification at the end of the rest, for when the app is in the background.
  useEffect(() => {
    if (endsAt == null || !restAlerts) {
      void cancelRestEnd();
      return;
    }
    void scheduleRestEnd((endsAt - Date.now()) / 1000, {
      title: t('session.restDoneTitle'),
      body: t('session.restDoneBody'),
    });
    return () => void cancelRestEnd();
  }, [endsAt, restAlerts, t]);

  const remaining = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!rest) {
      lastSpoken.current = null;
      return;
    }
    if (remaining > 0 && remaining <= 10 && spoken && lastSpoken.current !== remaining) {
      lastSpoken.current = remaining;
      Speech.speak(String(remaining));
    }
    if (remaining <= 0) {
      confirm();
      update((s) => ({ ...s, rest: null }));
    }
  }, [remaining, rest, spoken, update]);

  if (!rest) return null;
  const lit = Math.round((remaining / rest.totalS) * BAR_DOTS);

  const adjust = (delta: number) => update((s) => adjustRest(s, delta, Date.now()));

  const roundButton = (label: string, name: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.borderControl,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="bodyS">{label}</Text>
    </Pressable>
  );

  return (
    <Card gap={10}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
          <Text variant="label" muted>
            {t('session.rest', { time: formatClock(rest.totalS) })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('session.skipRest')}
          onPress={() => update((s) => ({ ...s, rest: null }))}
          style={({ pressed }) => ({
            minHeight: touch.minTarget,
            paddingHorizontal: 12,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.borderControl,
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text variant="label">{t('session.skip')}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {roundButton('-15', t('session.minus15'), () => adjust(-15))}
        <Text
          variant="displayXL"
          numeric
          style={{ fontSize: 60, lineHeight: 60 }}
          accessibilityLiveRegion="none"
        >
          {formatClock(remaining)}
        </Text>
        {roundButton('+15', t('session.plus15'), () => adjust(15))}
      </View>
      <DotBar
        shape="segment"
        total={BAR_DOTS}
        on={lit}
        size={5}
        accessibilityLabel={t('session.restProgress')}
      />
    </Card>
  );
}

export { restRemainingS };
