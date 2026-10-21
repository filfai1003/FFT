import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { StatusChip } from '@/components/ui/StatusChip';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel } from '@/domain/day';
import { dietDayStatus, goalForDay, targetForDay } from '@/domain/diet';
import { useDayTotals, useGoals } from '@/features/diet/log';
import { useSetTaken, useSupplementLogs, useSupplements } from '@/features/supplements/data';
import { SupplementsSheet } from '@/features/supplements/SupplementsSheet';
import { type SessionView } from '@/features/train/history';
import { MarkDoneSheet } from '@/features/train/MarkDoneSheet';
import { useSetWorkoutDeleted } from '@/features/train/mark-done';
import { useToday } from '@/features/profile/use-today';
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
  const today = useToday();

  const goals = useGoals();
  const totals = useDayTotals(day);
  // Null without a target that day (DECISIONS 104): just what was eaten, no on/off target.
  const target = targetForDay(goalForDay(goals.data ?? [], day), sessions.length > 0);
  const eaten = totals.data;
  const status = target && eaten ? dietDayStatus(eaten.kcal, target.kcal) : 'none';

  const setWorkoutDeleted = useSetWorkoutDeleted();
  const [marking, setMarking] = useState(false);

  const supplements = useSupplements();
  const taken = useSupplementLogs(day, day).data?.get(day);
  const setTaken = useSetTaken();
  const [editing, setEditing] = useState(false);

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
                      {t('calendar.workoutInfo', { count: s.stats.sets })}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="body" semibold numeric style={{ flex: 1 }}>
                  {target
                    ? t('calendar.dietLine', {
                        eaten: Math.round(eaten.kcal),
                        target: Math.round(target.kcal),
                      })
                    : t('calendar.dietLineNoTarget', { eaten: Math.round(eaten.kcal) })}
                </Text>
                {target && !(day === today && eaten.kcal < target.kcal) ? (
                  <StatusChip
                    area={status === 'onTarget' ? 'better' : 'worse'}
                    icon={status === 'onTarget' ? 'check' : 'close'}
                    label={status === 'onTarget' ? t('calendar.onTarget') : t('calendar.offTarget')}
                  />
                ) : null}
              </View>
              {/* Eaten against the target as a filled bar (DECISIONS 114). */}
              {target ? (
                <DotBar
                  total={Math.max(1, Math.round(target.kcal))}
                  on={Math.min(Math.round(eaten.kcal), Math.round(target.kcal))}
                  color={colors.nutrition}
                  track={colors.nutritionSoft}
                  accessibilityLabel={t('calendar.dietLine', {
                    eaten: Math.round(eaten.kcal),
                    target: Math.round(target.kcal),
                  })}
                />
              ) : null}
              <Text variant="bodyS" muted>
                {t('diet.mealLine', {
                  kcal: Math.round(eaten.kcal),
                  p: Math.round(eaten.protein),
                  c: Math.round(eaten.carbs),
                  f: Math.round(eaten.fat),
                })}
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
            {section(t('calendar.supplements'), colors.success)}
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

      <MarkDoneSheet visible={marking} onClose={() => setMarking(false)} day={day} />

      <SupplementsSheet visible={editing} onClose={() => setEditing(false)} />
    </>
  );
}
