import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel } from '@/domain/day';
import { dietDayStatus, goalForDay, targetForDay } from '@/domain/diet';
import { useDayTotals, useGoals } from '@/features/diet/log';
import { useSetTaken, useSupplementLogs, useSupplements } from '@/features/supplements/data';
import { SupplementsSheet } from '@/features/supplements/SupplementsSheet';
import { type SessionView } from '@/features/train/history';
import { useMarkWorkoutDone, useSetWorkoutDeleted } from '@/features/train/mark-done';
import { useActivePlan, useRotation } from '@/features/train/plans';
import { useToastStore } from '@/lib/toast-store';

/**
 * The selected day of the calendar, and what can be changed on it: mark a workout as done,
 * open that day's nutrition, tick the supplements taken.
 */
export function DayDetail({ day, sessions }: { day: string; sessions: SessionView[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);

  const goals = useGoals();
  const totals = useDayTotals(day);
  const goal = goalForDay(goals.data ?? [], day);
  const target = goal ? targetForDay(goal, sessions.length > 0) : null;
  const eaten = totals.data;
  const status = target && eaten ? dietDayStatus(eaten.kcal, target.kcal) : 'none';

  const { plan } = useActivePlan();
  const rotation = useRotation(plan);
  const markDone = useMarkWorkoutDone();
  const setWorkoutDeleted = useSetWorkoutDeleted();
  const [marking, setMarking] = useState(false);

  const supplements = useSupplements();
  const taken = useSupplementLogs(day, day).data?.get(day);
  const setTaken = useSetTaken();
  const [editing, setEditing] = useState(false);

  const mark = async (name: string, planDayId: string | null) => {
    setMarking(false);
    const planDay = plan?.days.find((d) => d.id === planDayId) ?? null;
    const id = await markDone.mutateAsync({
      day,
      name,
      plan: planDay ? plan : null,
      planDay,
      rotation,
    });
    showToast({
      message: t('calendar.markedDone', { name }),
      actionLabel: t('common.undo'),
      onAction: () => setWorkoutDeleted.mutate({ id, deleted: true }),
    });
  };

  const section = (title: string, color: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="bodyS" muted>
        {title}
      </Text>
    </View>
  );
  const divider = { borderTopWidth: 1, borderColor: colors.borderDecorative, paddingTop: 12 };

  return (
    <>
      <Card gap={12}>
        <Text variant="titleM">{shortDateLabel(day)}</Text>

        <View style={{ gap: 6 }}>
          {section(t('calendar.workouts'), colors.track.workout)}
          {sessions.map((s) => {
            const name = s.name || t('train.emptyWorkout');
            return (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  onPress={() =>
                    router.push({
                      pathname: '/progress/history/[sessionId]',
                      params: { sessionId: s.id },
                    })
                  }
                  style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
                >
                  <Text variant="body">{name}</Text>
                  {s.stats.sets > 0 ? (
                    <Text variant="bodyS" muted>
                      {t('calendar.workoutInfo', { sets: s.stats.sets })}
                    </Text>
                  ) : null}
                </Pressable>
                <IconButton
                  icon="trash"
                  size={36}
                  accessibilityLabel={t('calendar.removeWorkout', { name })}
                  onPress={() =>
                    setWorkoutDeleted.mutate(
                      { id: s.id, deleted: true },
                      {
                        onSuccess: () =>
                          showToast({
                            message: t('calendar.workoutRemoved', { name }),
                            actionLabel: t('common.undo'),
                            onAction: () => setWorkoutDeleted.mutate({ id: s.id, deleted: false }),
                          }),
                      },
                    )
                  }
                />
              </View>
            );
          })}
          <Button
            variant="secondary"
            icon="check"
            label={t('calendar.markDone')}
            onPress={() => setMarking(true)}
          />
        </View>

        <View style={[{ gap: 6 }, divider]}>
          {section(t('calendar.diet'), colors.track.diet)}
          {eaten && eaten.kcal > 0 ? (
            <>
              <Text variant="body">
                {t('calendar.dietLine', {
                  eaten: Math.round(eaten.kcal),
                  target: Math.round(target?.kcal ?? 0),
                })}
              </Text>
              <Text variant="bodyS" muted>
                {`${t('diet.mealLine', {
                  kcal: Math.round(eaten.kcal),
                  p: Math.round(eaten.protein),
                  c: Math.round(eaten.carbs),
                  f: Math.round(eaten.fat),
                })} · ${status === 'onTarget' ? t('calendar.dietOnTarget') : t('calendar.dietOff')}`}
              </Text>
            </>
          ) : null}
          <Button
            variant="secondary"
            icon="edit"
            label={t('calendar.openDiet')}
            onPress={() => router.push({ pathname: '/diet', params: { day } })}
          />
        </View>

        <View style={[{ gap: 2 }, divider]}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            {section(t('calendar.supplements'), colors.track.supplement)}
            {(supplements.data?.length ?? 0) > 0 ? (
              <IconButton
                icon="edit"
                size={36}
                accessibilityLabel={t('calendar.editSupplements')}
                onPress={() => setEditing(true)}
              />
            ) : null}
          </View>
          {(supplements.data ?? []).map((s) => {
            const label = s.dose ? `${s.name} · ${s.dose}` : s.name;
            return (
              <View
                key={s.id}
                style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <Text style={{ flex: 1 }}>{label}</Text>
                <Toggle
                  value={taken?.has(s.id) ?? false}
                  accessibilityLabel={label}
                  onValueChange={(v) => setTaken.mutate({ day, supplementId: s.id, taken: v })}
                />
              </View>
            );
          })}
          {(supplements.data?.length ?? 0) === 0 ? (
            <Button
              variant="secondary"
              icon="plus"
              label={t('calendar.addSupplement')}
              onPress={() => setEditing(true)}
            />
          ) : null}
        </View>
      </Card>

      <Sheet
        visible={marking}
        onClose={() => setMarking(false)}
        title={t('calendar.markDoneTitle', { date: shortDateLabel(day) })}
        closeLabel={t('common.close')}
      >
        <View style={{ gap: 8 }}>
          {(plan?.days ?? []).map((d) => (
            <Button
              key={d.id}
              variant={rotation?.state.upNextDayId === d.id ? 'primary' : 'secondary'}
              label={d.name}
              disabled={markDone.isPending}
              onPress={() => void mark(d.name, d.id)}
            />
          ))}
          <Button
            variant="ghost"
            label={t('calendar.otherWorkout')}
            disabled={markDone.isPending}
            onPress={() => void mark(t('calendar.otherWorkout'), null)}
          />
        </View>
      </Sheet>

      <SupplementsSheet visible={editing} onClose={() => setEditing(false)} />
    </>
  );
}
