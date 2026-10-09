import { IconButton } from '@/components/ui/IconButton';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel, weekOf } from '@/domain/day';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import {
  checkAsPlanned,
  eatenFromChecks,
  mealsDone,
  nextFixedMeal,
  sumMacros,
  type FixedCheck,
} from '@/domain/diet';
import { confirm } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';
import { AdjustMealSheet } from './AdjustMealSheet';
import { DayPickerSheet } from './DayPickerSheet';
import { DayStrip } from './DayStrip';
import { DaySummaryCard } from './DaySummaryCard';
import { PickDayLabel } from './PickDayLabel';
import { useDayTarget, useDietDay } from './day-hooks';
import {
  useFixedChecks,
  useFixedPlan,
  useSetCheck,
  type FixedMeal,
  type StoredCheck,
} from './fixed';
import { useDayLog } from './log';

/** Diet tab in "Fixed meals" mode: tick the meals you ate; tap a meal to adjust it for today. */
export function FixedMealsLog() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const { day, today, setDay } = useDietDay();
  const plan = useFixedPlan();
  const checks = useFixedChecks(day);
  const foodLog = useDayLog(day);
  const target = useDayTarget(day);
  const setCheck = useSetCheck();
  const showToast = useToastStore((s) => s.show);
  const [calendar, setCalendar] = useState(false);
  const [adjusting, setAdjusting] = useState<FixedMeal | null>(null);

  const meals = plan.data?.meals ?? [];
  const stored = checks.data ?? [];
  const checkOf = (id: string) => stored.find((c) => c.fixedMealId === id);
  const next = nextFixedMeal(meals, stored);
  // Foods logged "instead of" a meal count too (they are food_logs rows).
  const eaten = sumMacros([eatenFromChecks(stored), ...(foodLog.data ?? []).map((e) => e.macros)]);

  const toggle = (meal: FixedMeal) => {
    const before = checkOf(meal.id);
    const isDone = before?.status === 'done' || before?.status === 'adjusted';
    if (isDone) {
      setCheck.mutate({ day, mealId: meal.id, check: null });
      showToast({
        message: t('diet.mealUnchecked', { name: meal.name }),
        actionLabel: t('common.undo'),
        bottomOffset: barHeight,
        onAction: () => restore(meal.id, before),
      });
    } else {
      setCheck.mutate({ day, mealId: meal.id, check: checkAsPlanned(meal) });
      confirm();
      showToast({
        message: t('diet.mealDone', { name: meal.name }),
        actionLabel: t('common.undo'),
        bottomOffset: barHeight,
        onAction: () => restore(meal.id, before),
      });
    }
  };

  const restore = (mealId: string, before: StoredCheck | undefined) => {
    setCheck.mutate({
      day,
      mealId,
      check: before
        ? {
            status: before.status,
            kcal: before.kcal,
            proteinG: before.proteinG,
            carbsG: before.carbsG,
            fatG: before.fatG,
          }
        : null,
    });
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={12}>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <View style={{ gap: 4 }}>
            <PickDayLabel label={shortDateLabel(day)} onPress={() => setCalendar(true)} />
            <Text variant="screenTitle">{t('diet.title')}</Text>
          </View>
          <IconButton
            icon="more"
            accessibilityLabel={t('diet.goalsAndMode')}
            onPress={() => router.push('/diet-goals')}
          />
        </View>

        <DayStrip days={weekOf(day, weekStart)} selected={day} onSelect={setDay} />

        {target ? (
          <DaySummaryCard
            eaten={eaten}
            target={target}
            caption={t('diet.mealsCount', {
              done: mealsDone(stored as FixedCheck[]),
              total: meals.length,
            })}
          />
        ) : null}

        <View style={{ gap: 8 }}>
          {meals.map((m) => {
            const check = checkOf(m.id);
            const done = check?.status === 'done' || check?.status === 'adjusted';
            const skipped = check?.status === 'skipped';
            const isNext = next === m.id;
            const planned = check?.status === 'adjusted' ? check : m;
            return (
              <View
                key={m.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  paddingLeft: 16,
                  paddingRight: 12,
                  borderRadius: radius.cardSmall,
                  borderWidth: 1,
                  borderColor: isNext ? colors.borderControl : colors.borderDecorative,
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('diet.adjust', { name: m.name })}
                  onPress={() => setAdjusting(m)}
                  style={{ flex: 1, gap: 3, minHeight: touch.minTarget, justifyContent: 'center' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text
                      variant="bodyL"
                      medium
                      style={{ color: done || skipped ? colors.textMuted : colors.text }}
                    >
                      {m.name}
                    </Text>
                    {isNext ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: colors.accent,
                          }}
                        />
                        <Text variant="label" muted>
                          {t('diet.upNext')}
                        </Text>
                      </View>
                    ) : null}
                    {done ? (
                      <Text variant="label" muted>
                        {check?.status === 'adjusted' ? t('diet.adjusted') : t('diet.done')}
                      </Text>
                    ) : null}
                    {skipped ? (
                      <Text variant="label" muted>
                        {t('diet.skipped')}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="label" muted style={{ letterSpacing: 0.3 }}>
                    {t('diet.mealLine', {
                      kcal: 'kcal' in planned ? planned.kcal : 0,
                      p: Math.round(planned.proteinG),
                      c: Math.round(planned.carbsG),
                      f: Math.round(planned.fatG),
                    })}
                  </Text>
                  {m.description ? (
                    <Text variant="bodyS" muted>
                      {m.description}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  aria-checked={done}
                  accessibilityLabel={
                    done
                      ? t('diet.doneUndo', { name: m.name })
                      : t('diet.markDone', { name: m.name })
                  }
                  onPress={() => toggle(m)}
                  style={{
                    width: touch.checkButton,
                    height: touch.checkButton,
                    borderRadius: touch.checkButton / 2,
                    borderWidth: 1,
                    borderStyle: done ? 'solid' : 'dashed',
                    borderColor: done ? colors.borderSelected : colors.borderControl,
                    backgroundColor: done ? colors.surfaceSelected : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon
                    name="check"
                    size={22}
                    color={done ? colors.text : colors.textPlaceholderIcon}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>
      </Screen>

      <DayPickerSheet
        visible={calendar}
        onClose={() => setCalendar(false)}
        selected={day}
        today={today}
        onSelect={setDay}
      />
      <AdjustMealSheet
        meal={adjusting}
        day={day}
        check={adjusting ? checkOf(adjusting.id) : undefined}
        onClose={() => setAdjusting(null)}
      />
    </>
  );
}
