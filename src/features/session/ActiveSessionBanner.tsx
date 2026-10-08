import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { useNow } from '@/lib/use-now';
import { formatClock } from './logic';
import { useSessionStore } from './store';

/** "Workout in progress" row on Today and Train: the minimised session is one tap away. */
export function ActiveSessionBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const active = useSessionStore((s) => s.active);
  const now = useNow(1000, active != null);
  if (!active) return null;
  const elapsed = Math.max(0, Math.round((now - new Date(active.startedAt).getTime()) / 1000));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('session.resumeLabel', { name: active.dayName })}
      onPress={() =>
        router.push({ pathname: '/session/[sessionId]', params: { sessionId: active.id } })
      }
      style={({ pressed }) => ({
        minHeight: touch.listRowMin,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: 16,
        borderRadius: radius.cardSmall,
        borderWidth: 1,
        borderColor: colors.borderControl,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ gap: 2, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
          <Text variant="label" muted>
            {t('session.inProgress')}
          </Text>
        </View>
        <Text variant="body" numberOfLines={1}>
          {active.dayName}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text variant="displayS" numeric>
          {formatClock(elapsed)}
        </Text>
        <Text variant="label" muted>
          {t('session.resume')}
        </Text>
      </View>
    </Pressable>
  );
}
