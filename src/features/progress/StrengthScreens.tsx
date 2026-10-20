import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard, SkeletonGroup, SkeletonRows } from '@/components/ui/Skeleton';
import { DotBar } from '@/components/ui/DotBar';
import { DotColumnChart } from '@/components/ui/DotColumnChart';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { dotsOn } from '@/domain/dots';
import { strengthGroups, type StrengthGroup } from '@/domain/muscles';
import { displayWeight } from '@/domain/units';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { ExerciseThumb } from '@/features/train/exercise-image';
import { goBack } from '@/lib/navigation';
import { chartValues, signed, useChangeInk } from './ProgressScreen';
import { useProgressPeriod } from './series';
import { groupDetail, useStrength } from './strength';

/** Strength: overall score + per muscle group, or per exercise. */
export function StrengthScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { period } = useProgressPeriod();
  const s = useStrength(period);
  const [tab, setTab] = useState<'groups' | 'exercises'>('groups');
  const unit = usePreferencesStore((st) => st.weightUnit);

  const { colors } = useTheme();
  const ink = useChangeInk();
  const exercises = [...s.changes].sort((a, b) => b.pctChange - a.pctChange);
  const maxPct = Math.max(1, ...s.groups.map((g) => Math.abs(g.pctChange)));

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar
        onBack={() => goBack(router, '/progress')}
        backLabel={t('common.back')}
        right={
          <Text variant="bodyS" muted>
            {t(`progress.periodLong.${period}`)}
          </Text>
        }
      />
      <Text variant="screenTitle">{t('progress.strengthTitle')}</Text>

      <Segmented
        accessibilityLabel={t('progress.groupBy')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'groups', label: t('progress.byGroups') },
          { value: 'exercises', label: t('progress.byExercises') },
        ]}
      />

      {s.isPending ? (
        <SkeletonGroup accessibilityLabel={t('common.loading')}>
          <SkeletonCard tile={false} lines={0} height={120} />
          <SkeletonRows count={4} leading={false} />
        </SkeletonGroup>
      ) : (
        <>
          <Card gap={12}>
            {s.overall != null ? (
              <>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text
                    variant="displayL"
                    numeric
                    style={{ color: ink(s.overall) }}
                  >{`${signed(s.overall)}%`}</Text>
                  <Text variant="bodyS" muted>
                    {t('progress.overall')}
                  </Text>
                </View>
                <DotColumnChart
                  values={chartValues(s.series)}
                  rows={10}
                  stretch
                  color={colors.trainingSoft}
                  lastColor={colors.training}
                  accessibilityLabel={t('progress.strengthChart', { pct: signed(s.overall) })}
                />
              </>
            ) : (
              <EmptyState
                card={false}
                compact
                icon="chart"
                area="training"
                title={t('empty.strengthTitle')}
                body={t('empty.strengthBody')}
              />
            )}
          </Card>

          {/* Nothing to list before the first change: the card above says how to get one. */}
          {s.changes.length === 0 ? null : tab === 'groups' ? (
            <Section title={t('progress.byGroup')}>
              {s.groups.map((g) => (
                <GroupRow
                  key={g.group}
                  name={t(`progress.group.${g.group}`)}
                  sets={g.sets}
                  pct={g.pctChange}
                  on={dotsOn(Math.max(0, g.pctChange), maxPct, 12)}
                  onPress={() =>
                    router.push({
                      pathname: '/progress/strength/[group]',
                      params: { group: g.group },
                    })
                  }
                />
              ))}
            </Section>
          ) : (
            <Section title={t('progress.exercisesEst')}>
              {exercises.map((c) => {
                const ex = s.exerciseName(c.exerciseId);
                return (
                  <ListRow
                    key={c.exerciseId}
                    title={ex?.name ?? ''}
                    info={t('progress.fromTo', {
                      from: Math.round(displayWeight(c.firstKg, unit)),
                      to: Math.round(displayWeight(c.lastKg, unit)),
                      unit: unit,
                    })}
                    leading={ex ? <ExerciseThumb exercise={ex} size={40} /> : undefined}
                    right={<Pct value={c.pctChange} />}
                    onPress={() =>
                      router.push({
                        pathname: '/progress/exercise/[exerciseId]',
                        params: { exerciseId: c.exerciseId },
                      })
                    }
                  />
                );
              })}
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}

function GroupRow(props: {
  name: string;
  sets: number;
  pct: number;
  on: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.name}, ${signed(props.pct)}%`}
      onPress={props.onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 1,
        borderColor: colors.borderDecorative,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 92, gap: 2 }}>
        <Text variant="body">{props.name}</Text>
        <Text variant="bodyS" muted>
          {t('progress.setsCount', { count: props.sets })}
        </Text>
      </View>
      <View style={{ flex: 1 }} aria-hidden>
        {/* Gains fill the bar in green; a loss leaves it empty and the number says it in red. */}
        <DotBar
          shape="segment"
          total={12}
          on={props.on}
          size={6}
          gap={3}
          color={colors.success}
          accessibilityLabel={props.name}
        />
      </View>
      <View style={{ width: 56, alignItems: 'flex-end' }}>
        <Pct value={props.pct} />
      </View>
    </Pressable>
  );
}

/** A signed percentage in the colour of its change (the sign says it too). */
function Pct({ value, digits = 1 }: { value: number; digits?: number }) {
  const ink = useChangeInk();
  return (
    <Text variant="label" semibold numeric style={{ color: ink(value) }}>
      {`${signed(value, digits)}%`}
    </Text>
  );
}

/** One muscle group: its score, chart, stats and the exercises behind it. */
export function MuscleGroupScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const unit = usePreferencesStore((st) => st.weightUnit);
  const { period } = useProgressPeriod();
  const { group } = useLocalSearchParams<{ group: string }>();
  const g = (strengthGroups as readonly string[]).includes(group)
    ? (group as StrengthGroup)
    : 'chest';
  const s = useStrength(period);
  const d = groupDetail(s, g);

  const ink = useChangeInk();
  // Only the numbers there are: the volume change needs a few weeks to compare.
  const stats = [
    { value: String(d.sets), label: t('progress.stat.sets'), color: colors.text },
    { value: String(d.setsPerWeek), label: t('progress.stat.perWeek'), color: colors.text },
    d.volumeChange != null
      ? {
          value: `${signed(d.volumeChange, 0)}%`,
          label: t('progress.stat.volume'),
          color: ink(d.volumeChange),
        }
      : null,
  ].filter((x) => x != null);

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar
        onBack={() => goBack(router, '/progress/strength')}
        backLabel={t('common.back')}
        right={
          <Text variant="bodyS" muted>
            {t(`progress.periodLong.${period}`)}
          </Text>
        }
      />
      <View style={{ gap: 6 }}>
        <Text variant="bodyS" muted>
          {t('progress.muscleGroup')}
        </Text>
        <Text variant="screenTitle" accessibilityRole="header">
          {t(`progress.group.${g}`)}
        </Text>
      </View>

      <Card gap={12}>
        {d.score != null ? (
          <>
            <View style={{ gap: 4 }}>
              <Text variant="displayL" numeric style={{ color: ink(d.score) }}>
                {`${signed(d.score)}%`}
              </Text>
              <Text variant="bodyS" muted>
                {t('progress.avgChange')}
              </Text>
            </View>
            <DotColumnChart
              values={chartValues(d.series)}
              rows={10}
              stretch
              color={colors.trainingSoft}
              lastColor={colors.training}
              accessibilityLabel={t('progress.groupChart', {
                name: t(`progress.group.${g}`),
                pct: signed(d.score),
              })}
            />
          </>
        ) : (
          <EmptyState
            card={false}
            compact
            icon="chart"
            area="training"
            title={t('empty.strengthTitle')}
            body={t('empty.strengthBody')}
          />
        )}
        <View
          style={{
            flexDirection: 'row',
            borderTopWidth: 1,
            borderColor: colors.borderDecorative,
            paddingTop: 12,
          }}
        >
          {stats.map((x) => (
            <View key={x.label} style={{ flex: 1, gap: 2 }}>
              <Text variant="displayS" numeric style={{ color: x.color }}>
                {x.value}
              </Text>
              <Text variant="bodyS" muted>
                {x.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {d.changes.length === 0 ? null : (
        <Section title={t('progress.exercisesEst')}>
          {d.changes.map((c) => {
            const ex = s.exerciseName(c.exerciseId);
            return (
              <ListRow
                key={c.exerciseId}
                title={ex?.name ?? ''}
                info={t('progress.fromTo', {
                  from: Math.round(displayWeight(c.firstKg, unit)),
                  to: Math.round(displayWeight(c.lastKg, unit)),
                  unit: unit,
                })}
                leading={ex ? <ExerciseThumb exercise={ex} size={40} /> : undefined}
                right={<Pct value={c.pctChange} />}
                onPress={() =>
                  router.push({
                    pathname: '/progress/exercise/[exerciseId]',
                    params: { exerciseId: c.exerciseId },
                  })
                }
              />
            );
          })}
        </Section>
      )}
    </Screen>
  );
}
