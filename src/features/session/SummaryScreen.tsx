import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { IconName } from '@/components/ui/Icon';
import { IconTile, type Area } from '@/components/ui/IconTile';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { deviceTimeZone, localDay, localHour, shortDateLabel } from '@/domain/day';
import { badgeCatalogue } from '@/domain/gamification';
import { badgeName } from '@/features/gamification/components';
import { useActivity, useTimeZone } from '@/features/gamification/data';
import { NextBadgeCard } from '@/features/gamification/MeCards';
import { useToday } from '@/features/profile/use-today';
import { gameWithWorkout } from './summary-game';
import { formatInt } from '@/domain/numbers';
import { displayWeight } from '@/domain/units';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { formatClock, trimNumber } from './logic';
import { syncPendingSessions } from './sync';
import { useSessionHydrated, useSessionStore } from './store';
import { useQueryClient } from '@tanstack/react-query';
import { historyKeys } from '@/features/train/history';

const FEELINGS = [1, 2, 3, 4, 5] as const;

/** "DONE": totals, new records, how it felt, notes. Works offline (reads the local copy). */
export function SummaryScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const queryClient = useQueryClient();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const hydrated = useSessionHydrated();
  const finished = useSessionStore((s) => (sessionId ? s.finished[sessionId] : undefined));
  const patch = useSessionStore((s) => s.patchFinished);
  const unit = usePreferencesStore((s) => s.weightUnit);
  const [feeling, setFeeling] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [showSets, setShowSets] = useState(false);
  const activity = useActivity();
  const today = useToday();
  const tz = useTimeZone();

  if (!hydrated) return <Screen>{null}</Screen>;
  if (!finished) {
    return (
      <Screen gap={16}>
        <EmptyState
          icon="dumbbell"
          area="training"
          title={t('session.noneTitle')}
          action={{ label: t('session.backToTrain'), onPress: () => router.replace('/train') }}
          actionVariant="primary"
        />
      </Screen>
    );
  }

  const { session, totals: sum, records } = finished;
  const started = new Date(session.startedAt);
  const day = localDay(started, deviceTimeZone());
  // Streak and the next badge, this workout included (DECISIONS 89).
  const game = activity.data
    ? gameWithWorkout(
        activity.data,
        {
          id: session.id,
          day: localDay(started, tz),
          hour: localHour(started, tz),
          planId: session.planId,
        },
        today,
      )
    : null;
  const streakBadge = badgeCatalogue.find(
    (b) => b.metric === 'streak' && b.target === game?.nextStreak,
  );
  const volume = displayWeight(sum.volumeKg, unit);

  // Canvas "Workout summary": each number with its tile (training purple, records orange).
  const stats: { label: string; value: string; unit: string; icon: IconName; area: Area }[] = [
    {
      label: t('summary.duration'),
      value: formatClock(sum.durationS),
      unit: t('summary.min'),
      icon: 'clock',
      area: 'training',
    },
    {
      label: t('summary.volume'),
      value: formatInt(volume),
      unit: unit,
      icon: 'dumbbell',
      area: 'training',
    },
    {
      label: t('summary.sets'),
      value: String(sum.setsDone),
      unit: `/ ${sum.setsTotal}`,
      icon: 'check',
      area: 'training',
    },
    {
      label: t('summary.records'),
      value: String(records.length),
      unit: t('summary.new'),
      icon: 'trophy',
      area: 'streak',
    },
  ];

  // Leave right away: the upload goes on in the background (and is retried when back online).
  const close = () => {
    patch(finished.session.id, { feeling, notes });
    router.replace('/(tabs)');
    void syncPendingSessions(
      () => void queryClient.invalidateQueries({ queryKey: historyKeys.all }),
    );
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 100} gap={16}>
        {/* Canvas "Workout summary": trophy, the day, "Workout done" and the records count. */}
        <View style={{ gap: 6, alignItems: 'center' }}>
          <IconTile icon="trophy" area="streak" size={80} />
          <Text variant="bodyS" muted>
            {`${session.dayName} · ${shortDateLabel(day)}`}
          </Text>
          <Text
            variant="displayXL"
            style={{ fontSize: 44, lineHeight: 48, textAlign: 'center' }}
            accessibilityRole="header"
          >
            {t('summary.title')}
          </Text>
          {records.length > 0 ? (
            <Text semibold>{t('summary.recordsToday', { count: records.length })}</Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {stats.map((s) => (
            <Card key={s.label} size="small" gap={8} style={{ width: '48%', flexGrow: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconTile icon={s.icon} area={s.area} size={30} />
                <Text variant="bodyS" semibold>
                  {s.label}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text variant="displayM" numeric>
                  {s.value}
                </Text>
                <Text variant="bodyS" muted>
                  {s.unit}
                </Text>
              </View>
            </Card>
          ))}
        </View>

        {records.length > 0 ? (
          <Card size="small" gap={0}>
            {records.map((r) => (
              <View
                key={`${r.exerciseId}-${r.kind}`}
                style={{
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 6,
                }}
              >
                <IconTile icon="trophy" area="streak" size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyS">{r.name}</Text>
                  <Text variant="bodyS" muted>
                    {r.kind === 'max'
                      ? t('summary.maxDetail', {
                          value: trimNumber(displayWeight(r.value, unit)),
                          unit: unit,
                          reps: r.reps,
                          was: trimNumber(displayWeight(r.was, unit)),
                        })
                      : t('summary.estDetail', {
                          value: Math.round(displayWeight(r.value, unit)),
                          unit: unit,
                          was: Math.round(displayWeight(r.was, unit)),
                        })}
                  </Text>
                </View>
                <View
                  style={{
                    minHeight: 24,
                    paddingHorizontal: 9,
                    borderRadius: 12,
                    backgroundColor: colors.text,
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="label" semibold style={{ color: colors.bg }}>
                    {r.kind === 'max' ? t('summary.newMax') : t('summary.newEst')}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {game ? (
          <>
            <Card size="small" gap={4}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconTile icon="flame" area="streak" size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="displayS" numeric>
                    {t('summary.streakDays', { count: game.streak })}
                  </Text>
                  <Text variant="bodyS" muted>
                    {streakBadge && game.nextStreak
                      ? t('game.moreDays', {
                          count: game.nextStreak - game.streak,
                          badge: badgeName(t, streakBadge.id),
                        })
                      : t('summary.streakKeep')}
                  </Text>
                </View>
              </View>
            </Card>
            <NextBadgeCard game={game} />
          </>
        ) : null}

        <View
          style={{ gap: 8 }}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('summary.howFelt')}
        >
          <Text variant="bodyS" muted>
            {t('summary.howFelt')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {FEELINGS.map((n) => {
              const selected = feeling === n;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  accessibilityLabel={`${n} ${t(`summary.feeling.${n}`)}`}
                  onPress={() => setFeeling(selected ? null : n)}
                  style={{
                    flex: 1,
                    minHeight: 52,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: selected ? colors.borderSelected : colors.borderControl,
                    backgroundColor: selected ? colors.surfaceSelected : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <Text variant="displayS" numeric>
                    {n}
                  </Text>
                  <Text variant="bodyS" muted={!selected}>
                    {t(`summary.feeling.${n}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input
          accessibilityLabel={t('summary.notes')}
          placeholder={t('summary.notesPlaceholder')}
          value={notes}
          onChangeText={setNotes}
        />

        {showSets ? (
          <Card size="small" gap={10}>
            {session.exercises
              .filter((e) => e.sets.some((s) => s.done))
              .map((e) => (
                <View key={e.rowId} style={{ gap: 4 }}>
                  <Text variant="bodyS" medium>
                    {e.name}
                  </Text>
                  <Text variant="bodyS" muted>
                    {e.sets
                      .filter((s) => s.done)
                      .map((s) =>
                        e.logType === 'weight_reps'
                          ? `${s.weight}×${s.reps}`
                          : s.reps || s.duration || s.distance,
                      )
                      .join(' · ')}
                  </Text>
                </View>
              ))}
          </Card>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowSets((v) => !v)}
          style={{ minHeight: touch.minTarget, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="bodyS" muted>
            {showSets ? t('summary.hideSets') : t('summary.seeSets')}
          </Text>
        </Pressable>
      </Screen>
      <BottomActionBar>
        <Button size="large" label={t('summary.done')} onPress={close} />
      </BottomActionBar>
    </>
  );
}
