import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { DotBar } from '@/components/ui/DotBar';
import { Icon } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { pressFeedback } from '@/components/ui/motion';
import { Text } from '@/components/ui/Text';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { useNow } from '@/lib/use-now';
import { formatClock } from './logic';
import { useSessionStore } from './store';

/**
 * "Workout in progress" row on Today and Train: the minimised session is one tap away. Training
 * tile, the day, how far it is (sets done as a purple bar) and the running clock.
 */
export function ActiveSessionBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const active = useSessionStore((s) => s.active);
  const now = useNow(1000, active != null);
  if (!active) return null;
  const elapsed = Math.max(0, Math.round((now - new Date(active.startedAt).getTime()) / 1000));
  const sets = active.exercises.flatMap((e) => e.sets);
  const done = sets.filter((s) => s.done).length;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('session.resumeLabelFull', {
        name: active.dayName,
        done,
        count: sets.length,
        time: formatClock(elapsed),
      })}
      onPress={() =>
        router.push({ pathname: '/session/[sessionId]', params: { sessionId: active.id } })
      }
      style={({ pressed }) => ({
        minHeight: touch.listRowMin + 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: radius.cardSmall,
        borderWidth: 1,
        borderColor: colors.training,
        backgroundColor: colors.surface,
        opacity: pressed ? pressFeedback.opacity : 1,
      })}
    >
      <IconTile icon="play" area="training" size={40} />
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text variant="body" semibold numberOfLines={1} style={{ flexShrink: 1 }}>
            {active.dayName}
          </Text>
          <Text variant="label" semibold numeric style={{ color: colors.trainingInk }}>
            {t('session.setsDoneShort', { done, count: sets.length })}
          </Text>
        </View>
        {sets.length > 0 ? (
          <DotBar
            total={sets.length}
            on={done}
            size={6}
            color={colors.training}
            track={colors.trainingSoft}
            accessibilityLabel={t('session.setsProgress')}
          />
        ) : (
          <Text variant="label" muted>
            {t('session.inProgress')}
          </Text>
        )}
      </View>
      <Text variant="displayS" numeric>
        {formatClock(elapsed)}
      </Text>
      <Icon name="chevronRight" size={20} color={colors.textMuted} />
    </Pressable>
  );
}
