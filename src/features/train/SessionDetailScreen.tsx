import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { deviceTimeZone } from '@/domain/day';
import { displayWeight } from '@/domain/units';
import { useProfile } from '@/features/profile/api';
import { useStartWorkout } from '@/features/session/start';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { setLabel } from './ExerciseDetailScreen';
import { ExerciseThumb } from './exercise-image';
import { useSessionDetail } from './history';
import { useExercises } from './exercises';
import { goBack } from '@/lib/navigation';

export function SessionDetailScreen({
  sessionId,
  exerciseRoute,
}: {
  sessionId: string;
  exerciseRoute: '/train/exercise/[exerciseId]' | '/progress/exercise/[exerciseId]';
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const tz = useProfile().data?.timezone ?? deviceTimeZone();
  const session = useSessionDetail(sessionId);
  const exercises = useExercises();
  const { startFromExercises } = useStartWorkout();

  const s = session.data;
  if (!s) return <Screen>{null}</Screen>;
  const byId = new Map((exercises.data ?? []).map((e) => [e.id, e]));
  const when = new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  })
    .format(new Date(s.startedAt))
    .replace(',', '');

  const stats = [
    { value: String(s.stats.minutes), label: t('detail.minutes') },
    {
      value: (displayWeight(s.stats.volumeKg, unit) / 1000).toFixed(1),
      label: unit === 'kg' ? t('detail.tonnes') : t('detail.kLb'),
    },
    { value: String(s.stats.sets), label: t('detail.sets') },
  ];

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar
        onBack={() =>
          goBack(router, exerciseRoute.startsWith('/progress') ? '/progress' : '/train/history')
        }
        backLabel={t('common.back')}
      />

      <View style={{ gap: 6 }}>
        <Text variant="label" muted>
          {s.planName ? `${when} · ${s.planName}` : when}
        </Text>
        <Text variant="screenTitle" accessibilityRole="header">
          {s.name || t('train.emptyWorkout')}
        </Text>
      </View>

      <Card size="small" gap={0}>
        <View style={{ flexDirection: 'row' }}>
          {stats.map((x) => (
            <View key={x.label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Text variant="displayM" numeric>
                {x.value}
              </Text>
              <Text variant="label" muted>
                {x.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {s.notes ? (
        <Text variant="bodyS" muted>
          {s.notes}
        </Text>
      ) : null}

      <View style={{ gap: 8 }}>
        {s.exercises.map((e) => {
          const ex = byId.get(e.exerciseId);
          if (!ex) return null;
          return (
            <View
              key={e.exerciseId}
              style={{
                flexDirection: 'row',
                gap: 12,
                borderRadius: radius.row + 2,
                borderWidth: 1,
                borderColor: colors.borderDecorative,
                backgroundColor: colors.surfaceAlt,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <ExerciseThumb exercise={ex} size={40} />
              <View style={{ flex: 1, gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={ex.name}
                  onPress={() =>
                    router.push({ pathname: exerciseRoute, params: { exerciseId: ex.id } })
                  }
                  style={{ minHeight: 24 }}
                >
                  <Text variant="body">{ex.name}</Text>
                </Pressable>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {e.sets.map((set, i) => (
                    <View
                      key={i}
                      style={{
                        height: 26,
                        paddingHorizontal: 9,
                        borderRadius: 13,
                        borderWidth: 1,
                        borderColor: colors.borderControl,
                        justifyContent: 'center',
                      }}
                    >
                      <Text variant="label">{setLabel(ex, set, unit)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <Button
        label={t('detail.repeat')}
        variant="secondary"
        onPress={() =>
          startFromExercises(
            s.name || t('train.emptyWorkout'),
            s.exercises.flatMap((e) => {
              const ex = byId.get(e.exerciseId);
              return ex ? [{ exercise: ex, sets: e.sets.length }] : [];
            }),
          )
        }
      />
    </Screen>
  );
}
