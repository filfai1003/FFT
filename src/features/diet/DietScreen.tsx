import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { IconTile } from '@/components/ui/IconTile';
import { Screen } from '@/components/ui/Screen';
import { Skeleton, SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { radius, touch } from '@/design/tokens';
import { formatInt } from '@/domain/numbers';
import { useTheme } from '@/design/use-theme';
import { meals, sumMacros, type Meal } from '@/domain/diet';
import { addDays, shortDateLabel, weekOf } from '@/domain/day';
import { useProfile } from '@/features/profile/api';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { AddButton } from './AddButton';
import { mealIcon } from './meal-icon';
import { DayPickerSheet } from './DayPickerSheet';
import { DayStrip } from './DayStrip';
import { DaySummaryCard } from './DaySummaryCard';
import { PickDayLabel } from './PickDayLabel';
import { FixedMealsLog } from './FixedMealsLog';
import { useDietDay, useDayTarget } from './day-hooks';
import { useStripStatuses } from './week-status';
import { useToastStore } from '@/lib/toast-store';
import { useCopyEntries, useDayLog, useDayTotals, useSetLogDeleted, type LogEntry } from './log';

/** Diet tab: the food log of the chosen mode (count foods or fixed meals). */
export function DietScreen() {
  const profile = useProfile();
  // The mode decides the whole page: placeholders until it is read, never one log then the other.
  if (profile.isPending) return <DietSkeleton />;
  if (profile.data?.diet_mode === 'fixed_meals') return <FixedMealsLog />;
  return <FoodLog />;
}

function DietSkeleton() {
  const { t } = useTranslation();
  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <Text variant="screenTitle" accessibilityRole="header">
        {t('nav.diet')}
      </Text>
      <SkeletonGroup accessibilityLabel={t('common.loading')}>
        <Skeleton height={64} style={{ borderRadius: radius.card }} />
        <SkeletonCard tile={false} lines={1} height={190} />
        {meals.map((m) => (
          <SkeletonCard key={m} lines={0} />
        ))}
      </SkeletonGroup>
    </Screen>
  );
}

function FoodLog() {
  const { t } = useTranslation();
  const router = useRouter();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const { day, today, setDay } = useDietDay();
  const [calendar, setCalendar] = useState(false);
  const log = useDayLog(day);
  const before = useDayLog(addDays(day, -1));
  const totals = useDayTotals(day);
  const target = useDayTarget(day);
  const week = weekOf(day, weekStart);
  const statuses = useStripStatuses(week, today);
  const copy = useCopyEntries();
  const setDeleted = useSetLogDeleted();
  const showToast = useToastStore((s) => s.show);

  const entries = log.data ?? [];
  const byMeal = (m: Meal) => entries.filter((e) => e.meal === m);
  const yesterdayOf = (m: Meal) => (before.data ?? []).filter((e) => e.meal === m);

  /** One tap: yesterday's meal again, as new entries (UNDO removes them). */
  const sameAsYesterday = async (meal: Meal) => {
    if (copy.isPending) return;
    const ids = await copy.mutateAsync({ entries: yesterdayOf(meal), day, meal });
    showToast({
      message: t('diet.copiedMeal', { meal: t(`diet.meal.${meal}`), count: ids.length }),
      actionLabel: t('common.undo'),
      onAction: () => {
        for (const id of ids) setDeleted.mutate({ id, deleted: true });
      },
    });
  };
  const eaten = totals.data ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const mealsWithFood = meals.filter((m) => byMeal(m).length > 0).length;

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <View style={{ gap: 4 }}>
            {/* The day itself (not only the month): which day the log shows, at a glance. */}
            <PickDayLabel label={shortDateLabel(day)} onPress={() => setCalendar(true)} />
            <Text variant="screenTitle" accessibilityRole="header">
              {t('nav.diet')}
            </Text>
          </View>
          <IconButton
            icon="gear"
            accessibilityLabel={t('diet.goalsAndMode')}
            onPress={() => router.push('/diet-goals')}
          />
        </View>

        <DayStrip days={week} selected={day} onSelect={setDay} statuses={statuses} />

        {/* A day with nothing logged is the same card, unfilled: no separate empty message. */}
        <DaySummaryCard
          eaten={eaten}
          target={target}
          loading={totals.isPending}
          caption={
            log.isSuccess
              ? t('diet.mealsCount', { done: mealsWithFood, total: meals.length })
              : undefined
          }
          onSetTarget={() => router.push('/diet-goals')}
        />

        <View style={{ gap: 10 }}>
          {meals.map((meal) => (
            <MealSection
              key={meal}
              meal={meal}
              loading={log.isPending}
              entries={byMeal(meal)}
              yesterday={yesterdayOf(meal)}
              onSameAsYesterday={() => void sameAsYesterday(meal)}
              onAdd={() => router.push({ pathname: '/food-search', params: { meal, day } })}
              onOpen={(e) =>
                router.push({
                  pathname: '/food/[foodId]',
                  params: {
                    foodId: e.foodId ?? 'none',
                    logId: e.id,
                    meal: e.meal,
                    day: e.day,
                  },
                })
              }
            />
          ))}
        </View>
      </Screen>
      <DayPickerSheet
        visible={calendar}
        onClose={() => setCalendar(false)}
        selected={day}
        today={today}
        onSelect={setDay}
      />
    </>
  );
}

function MealSection({
  meal,
  entries,
  yesterday,
  onSameAsYesterday,
  onAdd,
  onOpen,
  loading,
}: {
  /** The day's log is still being read: a placeholder instead of "Nothing yet". */
  loading: boolean;
  meal: Meal;
  entries: LogEntry[];
  /** The same meal the day before: offered in one tap while this one is empty. */
  yesterday: LogEntry[];
  onSameAsYesterday: () => void;
  onAdd: () => void;
  onOpen: (e: LogEntry) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const kcal = sumMacros(entries.map((e) => e.macros)).kcal;
  const yesterdayKcal = Math.round(sumMacros(yesterday.map((e) => e.macros)).kcal);
  const name = t(`diet.meal.${meal}`);
  const empty = !loading && entries.length === 0;
  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surface,
        paddingTop: 10,
        paddingBottom: 6,
        paddingLeft: 12,
        paddingRight: 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: touch.minTarget + 4,
        }}
      >
        <IconTile icon={mealIcon(meal)} area="nutrition" />
        <View style={{ flex: 1 }}>
          <Text variant="titleM" accessibilityRole="header">
            {name}
          </Text>
          {loading ? (
            <SkeletonGroup accessibilityLabel={t('common.loading')} style={{ paddingTop: 4 }}>
              <Skeleton width={96} height={12} />
            </SkeletonGroup>
          ) : (
            <Text variant="bodyS" muted numeric>
              {entries.length > 0
                ? t('diet.mealSummary', { kcal: formatInt(kcal), count: entries.length })
                : t('diet.nothingYet')}
            </Text>
          )}
        </View>
        {/* Filled while the meal is empty: adding is the next step there. */}
        <AddButton
          filled={empty}
          accessibilityLabel={t('diet.addTo', { meal: name })}
          onPress={onAdd}
        />
      </View>
      {empty && yesterday.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('diet.sameAsYesterdayLabel', {
            meal: name,
            count: yesterday.length,
            kcal: yesterdayKcal,
          })}
          onPress={onSameAsYesterday}
          style={({ pressed }) => ({
            minHeight: 52,
            marginTop: 6,
            marginBottom: 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            borderRadius: radius.row,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: colors.borderControl,
            backgroundColor: colors.surfaceAlt,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="copy" size={18} color={colors.text} />
          <View style={{ flex: 1, gap: 1, paddingVertical: 4 }}>
            <Text variant="body" semibold>
              {t('diet.sameAsYesterday')}
            </Text>
            <Text variant="bodyS" muted numberOfLines={1}>
              {yesterday.map((e) => e.name).join(', ')}
            </Text>
          </View>
          <Text variant="bodyS" semibold numeric>
            {t('diet.kcalValue', { kcal: formatInt(yesterdayKcal) })}
          </Text>
        </Pressable>
      ) : null}
      {entries.map((e) => (
        <Pressable
          key={e.id}
          accessibilityRole="button"
          accessibilityLabel={`${e.name}, ${e.quantityLabel ?? ''} ${Math.round(e.macros.kcal)} ${t('common.kcal')}`}
          disabled={!e.foodId}
          onPress={() => onOpen(e)}
          style={({ pressed }) => ({
            minHeight: 52,
            // Under the meal's name, past its tile.
            marginLeft: 52,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderTopWidth: 1,
            borderColor: colors.divider,
            paddingRight: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <View style={{ flex: 1, gap: 1, paddingVertical: 4 }}>
            <Text variant="body" medium numberOfLines={1}>
              {e.name}
            </Text>
            {e.quantityLabel ? (
              <Text variant="bodyS" muted>
                {e.quantityLabel}
              </Text>
            ) : null}
          </View>
          <Text variant="body" semibold numeric>
            {formatInt(e.macros.kcal)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
