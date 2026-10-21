import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { CheckFill } from '@/components/ui/CheckFill';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconTile } from '@/components/ui/IconTile';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import {
  checkAsPlanned,
  eatenFromChecks,
  mealForPosition,
  mealsDone,
  nextFixedMeal,
  sumMacros,
  type FixedCheck,
} from '@/domain/diet';
import { confirm } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';
import { AdjustMealSheet } from './AdjustMealSheet';
import { DietDayHeader } from './DietDayHeader';
import { DaySummaryCard } from './DaySummaryCard';
import { mealIcon } from './meal-icon';
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
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const { day, today, setDay } = useDietDay();
  const plan = useFixedPlan();
  const checks = useFixedChecks(day);
  const foodLog = useDayLog(day);
  const target = useDayTarget(day);
  const setCheck = useSetCheck();
  const showToast = useToastStore((s) => s.show);
  const [adjusting, setAdjusting] = useState<FixedMeal | null>(null);
  // fft://diet?adjust=<meal id>: "Different" on the Diet widget opens that meal's sheet (today).
  const { adjust: adjustLink } = useLocalSearchParams<{ adjust?: string }>();
  const [linkHandled, setLinkHandled] = useState<string | null>(null);

  const meals = plan.data?.meals ?? [];
  const stored = checks.data ?? [];
  const checkOf = (id: string) => stored.find((c) => c.fixedMealId === id);
  const next = nextFixedMeal(meals, stored);
  const linkedMeal =
    adjustLink && adjustLink !== linkHandled && day === today
      ? (meals.find((m) => m.id === adjustLink) ?? null)
      : null;
  const sheetMeal = adjusting ?? linkedMeal;
  // Foods logged "instead of" a meal count too (they are food_logs rows).
  const eaten = sumMacros([eatenFromChecks(stored), ...(foodLog.data ?? []).map((e) => e.macros)]);
  const loading = plan.isPending || checks.isPending;

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
      <Screen scroll bottomBarHeight={24} gap={12}>
        <DietDayHeader day={day} today={today} setDay={setDay} />

        <DaySummaryCard
          eaten={eaten}
          target={target}
          loading={loading}
          caption={
            meals.length > 0
              ? t('diet.mealsCount', {
                  done: mealsDone(stored as FixedCheck[]),
                  total: meals.length,
                })
              : undefined
          }
          onSetTarget={() => router.push('/diet-goals')}
        />

        {loading ? (
          <SkeletonGroup accessibilityLabel={t('common.loading')}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} lines={1} />
            ))}
          </SkeletonGroup>
        ) : meals.length === 0 ? (
          <EmptyState
            compact
            icon="bowl"
            area="nutrition"
            title={t('diet.noMealsTitle')}
            body={t('diet.noMealsBody')}
            action={{ label: t('diet.setUpMeals'), onPress: () => router.push('/diet-goals') }}
          />
        ) : (
          <View style={{ gap: 8 }}>
            {meals.map((m) => (
              <FixedMealRow
                key={m.id}
                meal={m}
                check={checkOf(m.id)}
                isNext={next === m.id}
                onAdjust={() => setAdjusting(m)}
                onToggle={() => toggle(m)}
              />
            ))}
          </View>
        )}
      </Screen>

      <AdjustMealSheet
        meal={sheetMeal}
        day={day}
        check={sheetMeal ? checkOf(sheetMeal.id) : undefined}
        onClose={() => {
          setAdjusting(null);
          setLinkHandled(adjustLink ?? null);
        }}
      />
    </>
  );
}

/**
 * One planned meal (canvas "Diet, fixed meals"): its tile, name and state as a chip ("Up next"
 * dark, "Done" / "Adjusted" green, "Skipped" neutral), the planned values, and the round tick.
 * The next meal has the 2px selection border.
 */
function FixedMealRow({
  meal: m,
  check,
  isNext,
  onAdjust,
  onToggle,
}: {
  meal: FixedMeal;
  check: StoredCheck | undefined;
  isNext: boolean;
  onAdjust: () => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const done = check?.status === 'done' || check?.status === 'adjusted';
  const skipped = check?.status === 'skipped';
  const planned = check?.status === 'adjusted' ? check : m;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: radius.cardSmall,
        borderWidth: isNext ? 2 : 1,
        borderColor: isNext ? colors.borderSelected : colors.borderDecorative,
        backgroundColor: colors.surface,
      }}
    >
      <IconTile icon={mealIcon(mealForPosition(m.position))} area="nutrition" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('diet.adjust', { name: m.name })}
        onPress={onAdjust}
        style={{ flex: 1, gap: 3, minHeight: touch.minTarget, justifyContent: 'center' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Text
            variant="bodyL"
            medium
            style={{ color: done || skipped ? colors.textMuted : colors.text }}
          >
            {m.name}
          </Text>
          {isNext ? <UpNextChip /> : null}
          {done ? (
            <StatusChip
              area="better"
              label={check?.status === 'adjusted' ? t('diet.adjusted') : t('diet.done')}
            />
          ) : null}
          {skipped ? <StatusChip label={t('diet.skipped')} /> : null}
        </View>
        <Text variant="bodyS" muted numeric>
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
          done ? t('diet.doneUndo', { name: m.name }) : t('diet.markDone', { name: m.name })
        }
        onPress={onToggle}
        style={{
          width: touch.checkButton,
          height: touch.checkButton,
          borderRadius: touch.checkButton / 2,
          borderWidth: done ? 0 : 1,
          borderStyle: 'dashed',
          borderColor: colors.borderControl,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Eaten = filled in the nutrition colour, with a short animation. */}
        <CheckFill
          done={done}
          size={touch.checkButton}
          fill={colors.nutrition}
          iconOn={colors.bg}
          iconOff={colors.textPlaceholderIcon}
        />
      </Pressable>
    </View>
  );
}

/** "Up next": a dark pill (no accent: that stays the one main action of the page). */
function UpNextChip() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 22,
        paddingHorizontal: 8,
        borderRadius: 11,
        backgroundColor: colors.text,
        justifyContent: 'center',
      }}
    >
      <Text variant="label" semibold style={{ color: colors.bg }}>
        {t('diet.upNext')}
      </Text>
    </View>
  );
}
