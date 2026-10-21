import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import * as Speech from 'expo-speech';
import { Card } from '@/components/ui/Card';
import { Gauge } from '@/components/ui/Gauge';
import { IconTile } from '@/components/ui/IconTile';
import { InfoButton } from '@/components/ui/InfoButton';
import { Text } from '@/components/ui/Text';
import { touch } from '@/design/tokens';
import { useAppearanceStore } from '@/design/appearance-store';
import { useTheme } from '@/design/use-theme';
import { confirm } from '@/lib/haptics';
import { cancelRestEnd, scheduleRestEnd } from '@/lib/notifications';
import { hideRestTimer, showRestTimer } from '../../../modules/rest-timer';
import { useNow } from '@/lib/use-now';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { adjustRest, formatClock, restRemainingS } from './logic';
import { useSessionStore } from './store';

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

  // In the background: the countdown in an ongoing notification (lock screen too, Android) and an
  // alert when the rest is over.
  useEffect(() => {
    if (endsAt == null || !restAlerts) {
      void cancelRestEnd();
      hideRestTimer();
      return;
    }
    showRestTimer(
      endsAt,
      t('session.restLiveTitle'),
      t('session.restLiveBody'),
      t('session.restChannel'),
    );
    void scheduleRestEnd((endsAt - Date.now()) / 1000, {
      title: t('session.restDoneTitle'),
      body: t('session.restDoneBody'),
    });
    return () => {
      void cancelRestEnd();
      hideRestTimer();
    };
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

  const adjust = (delta: number) => update((s) => adjustRest(s, delta, Date.now()));

  const roundButton = (label: string, name: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: colors.borderControl,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="body" medium>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Card gap={10}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconTile icon="clock" area="training" size={28} />
          <Text variant="bodyS" semibold>
            {t('session.rest', { time: formatClock(rest.totalS) })}
          </Text>
          <InfoButton topic="restTimer" />
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
        {roundButton('−15', t('session.minus15'), () => adjust(-15))}
        <Gauge
          value={rest.totalS > 0 ? remaining / rest.totalS : 0}
          size={180}
          stroke={12}
          color={colors.training}
          track={colors.trainingSoft}
          accessibilityLabel={t('session.restProgress')}
        >
          <Text
            variant="displayXL"
            numeric
            style={{ fontSize: 52, lineHeight: 56 }}
            accessibilityLiveRegion="none"
          >
            {formatClock(remaining)}
          </Text>
          <Text variant="bodyS" muted>
            {t('session.restOf', { time: formatClock(rest.totalS) })}
          </Text>
        </Gauge>
        {roundButton('+15', t('session.plus15'), () => adjust(15))}
      </View>
    </Card>
  );
}

export { restRemainingS };
