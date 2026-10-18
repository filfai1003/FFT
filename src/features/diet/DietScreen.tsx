import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { radius, touch } from '@/design/tokens';
import { formatInt } from '@/domain/numbers';
import { useTheme } from '@/design/use-theme';
import { meals, sumMacros, type Meal } from '@/domain/diet';
import { addDays, monthYearLabel, weekOf } from '@/domain/day';
import { useProfile } from '@/features/profile/api';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { DayPickerSheet } from './DayPickerSheet';
import { DayStrip } from './DayStrip';
import { DaySummaryCard } from './DaySummaryCard';
import { PickDayLabel } from './PickDayLabel';
import { FixedMealsLog } from './FixedMealsLog';
import { useDietDay, useDayTarget } from './day-hooks';
import { useToastStore } from '@/lib/toast-store';
import { useCopyEntries, useDayLog, useDayTotals, useSetLogDeleted, type LogEntry } from './log';

/** Diet tab: the food log of the chosen mode (count foods or fixed meals). */
export function DietScreen() {
  const profile = useProfile();
  if (profile.data?.diet_mode === 'fixed_meals') return <FixedMealsLog />;
  return <FoodLog />;
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

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <View style={{ gap: 4 }}>
            <PickDayLabel
              label={monthYearLabel(`${day.slice(0, 7)}-01`)}
              onPress={() => setCalendar(true)}
            />
            <Text variant="screenTitle" accessibilityRole="header">
              {t('nav.diet')}
            </Text>
          </View>
          <IconButton
            icon="settings"
            accessibilityLabel={t('diet.goalsAndMode')}
            onPress={() => router.push('/diet-goals')}
          />
        </View>

        <DayStrip days={weekOf(day, weekStart)} selected={day} onSelect={setDay} />

        {target ? (
          <DaySummaryCard
            eaten={eaten}
            target={target}
            caption={t('diet.targetLine', { kcal: formatInt(target.kcal) })}
          />
        ) : null}

        <View style={{ gap: 10 }}>
          {meals.map((meal) => (
            <MealSection
              key={meal}
              meal={meal}
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
}: {
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
  const name = t(`diet.meal.${meal}`);
  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surface,
        paddingVertical: 4,
        paddingLeft: 14,
        paddingRight: 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: touch.minTarget,
        }}
      >
        <Text variant="titleM" accessibilityRole="header" style={{ flex: 1 }}>
          {name}
        </Text>
        <Text variant="bodyS" muted numeric style={{ marginRight: 8 }}>
          {entries.length > 0
            ? t('diet.kcalValue', { kcal: Math.round(kcal) })
            : t('diet.nothingYet')}
        </Text>
        <IconButton
          look="soft"
          icon="plus"
          accessibilityLabel={t('diet.addTo', { meal: name })}
          onPress={onAdd}
        />
      </View>
      {entries.length === 0 && yesterday.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('diet.sameAsYesterdayLabel', {
            meal: name,
            count: yesterday.length,
            kcal: Math.round(sumMacros(yesterday.map((e) => e.macros)).kcal),
          })}
          onPress={onSameAsYesterday}
          style={({ pressed }) => ({
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderTopWidth: 1,
            borderColor: colors.divider,
            paddingRight: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="copy" size={18} color={colors.text} />
          <View style={{ flex: 1, gap: 1, paddingVertical: 4 }}>
            <Text variant="body">{t('diet.sameAsYesterday')}</Text>
            <Text variant="bodyS" muted numberOfLines={1}>
              {yesterday.map((e) => e.name).join(', ')}
            </Text>
          </View>
          <Text variant="bodyS" muted numeric>
            {t('diet.kcalValue', {
              kcal: Math.round(sumMacros(yesterday.map((e) => e.macros)).kcal),
            })}
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
            <Text variant="bodyS" muted>
              {e.quantityLabel ?? ''}
            </Text>
          </View>
          <Text variant="bodyS" semibold numeric>
            {String(Math.round(e.macros.kcal))}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
