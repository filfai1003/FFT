import { useNavigation, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { DotColumnChart } from '@/components/ui/DotColumnChart';
import type { IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { IconTile, type Area } from '@/components/ui/IconTile';
import { InfoButton, type ExplainTopic } from '@/components/ui/InfoButton';
import { StatusChip } from '@/components/ui/StatusChip';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { SkeletonGroup, SkeletonRows } from '@/components/ui/Skeleton';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { localDay } from '@/domain/day';
import { strengthGroup } from '@/domain/muscles';
import { displayWeight, type WeightUnit } from '@/domain/units';
import { useProfile } from '@/features/profile/api';
import { formatClock, trimNumber } from '@/features/session/logic';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { ExerciseThumb } from './exercise-image';
import { HowToCard } from './HowToCard';
import { MusclesWorked } from './MusclesWorked';
import { useExerciseTrend, useRecords } from './exercise-stats';
import { useExerciseSessions } from './history';
import { useDeleteExercise, useExercises, type Exercise } from './exercises';
import { goBack } from '@/lib/navigation';

type Metric = 'est1rm' | 'max';
const POINTS = 8;

export function ExerciseDetailScreen({
  exerciseId,
  sessionRoute,
  fromSession,
}: {
  exerciseId: string;
  sessionRoute: '/train/history/[sessionId]' | '/progress/history/[sessionId]';
  /** Id of the workout in progress this page was opened from: back returns to it. */
  fromSession?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const exercises = useExercises();
  const records = useRecords();
  const trend = useExerciseTrend(exerciseId);
  const sessions = useExerciseSessions(exerciseId);
  const timeZone = useProfile().data?.timezone ?? 'UTC';
  const remove = useDeleteExercise();
  const [metric, setMetric] = useState<Metric>('est1rm');
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exercise = exercises.data?.find((e) => e.id === exerciseId);
  const record = records.data?.get(exerciseId);
  const weighted = exercise?.logType === 'weight_reps';

  const series = (trend.data ?? [])
    .map((p) => ({ day: p.day, value: metric === 'est1rm' ? p.est1rmKg : p.maxKg }))
    .filter((p): p is { day: string; value: number } => p.value != null)
    .slice(-POINTS);
  const values = series.map((p) => displayWeight(p.value, unit));
  const delta =
    values.length >= 2 ? Math.round((values[values.length - 1] - values[0]) * 10) / 10 : null;

  if (!exercise) return <Screen>{null}</Screen>;

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        <TopBar
          onBack={() => {
            if (fromSession)
              return router.dismissTo({
                pathname: '/session/[sessionId]',
                params: { sessionId: fromSession },
              });
            const library = sessionRoute.startsWith('/progress') ? '/progress' : '/train/library';
            // Opened from a link or after a reload, the only page below is the tab's first one:
            // go to the library instead.
            const routes = navigation.getState()?.routes ?? [];
            if (routes.length > 1 && routes[routes.length - 2].name !== 'index') goBack(router);
            else router.replace(library);
          }}
          backLabel={t('common.back')}
          right={
            exercise.ownerId ? (
              <IconButton
                icon="more"
                accessibilityLabel={t('exerciseDetail.more')}
                onPress={() => setMenu(true)}
              />
            ) : undefined
          }
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <ExerciseThumb exercise={exercise} size={72} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="titleM" accessibilityRole="header">
              {exercise.name}
            </Text>
            <Text variant="bodyS" muted style={{ lineHeight: 16 }}>
              {[
                t(`library.filter.${strengthGroup(exercise.primaryMuscle)}`),
                exercise.equipment.charAt(0).toUpperCase() + exercise.equipment.slice(1),
              ].join(' · ')}
            </Text>
          </View>
        </View>

        <MusclesWorked exercise={exercise} />

        <HowToCard exerciseId={exercise.id} />

        {weighted ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatCard
                label={t('exerciseDetail.actualMax')}
                value={
                  record?.actualMaxKg != null
                    ? String(displayWeight(record.actualMaxKg, unit))
                    : '—'
                }
                unit={unit}
                note={t('exerciseDetail.heaviest')}
                icon="trophy"
                area="streak"
                info="actualMax"
              />
              <StatCard
                label={t('exerciseDetail.est1rm')}
                value={
                  record?.est1rmKg != null
                    ? String(Math.round(displayWeight(record.est1rmKg, unit)))
                    : '—'
                }
                unit={unit}
                note={t('exerciseDetail.epley')}
                icon="chart"
                area="training"
                info="e1rm"
              />
            </View>

            <Card size="small" gap={12}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Segmented
                    accessibilityLabel={t('exerciseDetail.metric')}
                    value={metric}
                    onChange={setMetric}
                    options={[
                      { value: 'est1rm', label: t('exerciseDetail.metricEst') },
                      { value: 'max', label: t('exerciseDetail.metricMax') },
                    ]}
                  />
                </View>
              </View>
              {values.length >= 2 ? (
                <>
                  {/* The change as a pill: green and up when stronger, red and down when weaker. */}
                  <StatusChip
                    area={delta! > 0 ? 'better' : delta! < 0 ? 'worse' : 'neutral'}
                    icon={delta! > 0 ? 'arrowUp' : delta! < 0 ? 'arrowDown' : undefined}
                    label={t('exerciseDetail.change', {
                      delta: `${delta! >= 0 ? '+' : '−'}${Math.abs(delta!)}`,
                      unit: unit,
                      count: values.length,
                    })}
                  />
                  <DotColumnChart
                    values={values}
                    rows={10}
                    dotSize={7}
                    dotGap={3}
                    columnGap={6}
                    stretch
                    color={colors.trainingSoft}
                    lastColor={colors.training}
                    labels={values.map((v) => String(Math.round(v)))}
                    accessibilityLabel={t(
                      delta! >= 0 ? 'exerciseDetail.chartLabel' : 'exerciseDetail.chartLabelDown',
                      {
                        from: Math.round(values[0]),
                        to: Math.round(values[values.length - 1]),
                        unit,
                      },
                    )}
                  />
                </>
              ) : (
                <Text variant="bodyS" muted>
                  {t('exerciseDetail.chartEmpty')}
                </Text>
              )}
            </Card>
          </>
        ) : (
          <Card size="small" gap={6}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <IconTile icon="trophy" area="streak" size={30} />
              <Text variant="bodyS" semibold>
                {t('exerciseDetail.best')}
              </Text>
            </View>
            <Text variant="displayM" numeric>
              {exercise.logType === 'reps'
                ? (record?.bestReps ?? '—')
                : record?.bestDurationS != null
                  ? formatClock(record.bestDurationS)
                  : '—'}
            </Text>
          </Card>
        )}

        <Section title={t('exerciseDetail.recent')}>
          {sessions.isPending ? (
            <SkeletonGroup accessibilityLabel={t('common.loading')}>
              <SkeletonRows count={3} leading={false} />
            </SkeletonGroup>
          ) : sessions.data?.length ? (
            sessions.data.map((s) => (
              <ListRow
                key={s.id}
                title={`${formatSessionDate(s.startedAt, timeZone)}${s.name ? ` · ${s.name}` : ''}`}
                info={s.sets.map((x) => setLabel(exercise, x, unit)).join(' · ')}
                onPress={() => router.push({ pathname: sessionRoute, params: { sessionId: s.id } })}
              />
            ))
          ) : (
            <EmptyState
              compact
              icon="dumbbell"
              area="training"
              title={t('empty.exerciseTitle')}
              body={t('empty.exerciseBody')}
            />
          )}
        </Section>
      </Screen>

      <Sheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={exercise.name}
        closeLabel={t('common.close')}
      >
        <Button
          label={t('exerciseDetail.edit')}
          variant="secondary"
          onPress={() => {
            setMenu(false);
            router.push({ pathname: '/exercise/[exerciseId]', params: { exerciseId } });
          }}
        />
        <Button
          label={t('exerciseDetail.delete')}
          variant="danger"
          onPress={() => {
            setMenu(false);
            setConfirmDelete(true);
          }}
        />
      </Sheet>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('exerciseDetail.deleteTitle')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            variant="danger"
            label={t('exerciseDetail.deleteConfirm')}
            disabled={remove.isPending}
            onPress={async () => {
              await remove.mutateAsync(exerciseId);
              setConfirmDelete(false);
              goBack(router, sessionRoute.startsWith('/progress') ? '/progress' : '/train/library');
            }}
          />
        }
      >
        <Text muted>{t('exerciseDetail.deleteBody')}</Text>
      </Sheet>
    </>
  );
}

function StatCard({
  label,
  value,
  unit,
  note,
  icon,
  area,
  info,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
  icon: IconName;
  area: Area;
  info: ExplainTopic;
}) {
  return (
    <Card size="small" gap={6} style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconTile icon={icon} area={area} size={30} />
        <Text variant="bodyS" semibold style={{ flex: 1 }}>
          {label}
        </Text>
        <InfoButton topic={info} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text variant="displayM" numeric>
          {value}
        </Text>
        <Text variant="bodyS" muted>
          {unit}
        </Text>
      </View>
      <Text variant="bodyS" muted>
        {note}
      </Text>
    </Card>
  );
}

/** "Thu Oct 1" from an instant, in the user's time zone. */
export function formatSessionDate(iso: string, timeZone: string): string {
  const day = localDay(new Date(iso), timeZone);
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

type SetValues = {
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  /** Its drops (drop set), shown after it: "80×8 ↘ 60×10". */
  drops?: SetValues[];
};

/** "80×5" / "10" / "1:00" for one set of any kind of exercise. */
export function setLabel(e: Pick<Exercise, 'logType'>, s: SetValues, unit: WeightUnit): string {
  switch (e.logType) {
    case 'weight_reps':
      return [s, ...(s.drops ?? [])]
        .map((x) => `${trimNumber(displayWeight(Number(x.weight_kg ?? 0), unit))}×${x.reps ?? 0}`)
        .join(' ↘ ');
    case 'reps':
      return String(s.reps ?? 0);
    case 'time':
      return formatClock(s.duration_s ?? 0);
    default:
      return `${trimNumber(Number(s.distance_m ?? 0) / 1000)} km`;
  }
}
