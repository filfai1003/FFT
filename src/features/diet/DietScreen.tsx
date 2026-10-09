import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { meals, sumMacros, type Meal } from '@/domain/diet';
import { monthYearLabel, weekOf } from '@/domain/day';
import { useProfile } from '@/features/profile/api';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { DayPickerSheet } from './DayPickerSheet';
import { DayStrip } from './DayStrip';
import { DaySummaryCard } from './DaySummaryCard';
import { FixedMealsLog } from './FixedMealsLog';
import { useDietDay, useDayTarget } from './day-hooks';
import { useDayLog, useDayTotals, type LogEntry } from './log';

/** Diet tab: the food log of the chosen mode (count foods or fixed meals). */
export function DietScreen() {
  const profile = useProfile();
  if (profile.data?.diet_mode === 'fixed_meals') return <FixedMealsLog />;
  return <FoodLog />;
}

function FoodLog() {
  const { t } = useTranslation();
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const { day, today, setDay } = useDietDay();
  const [calendar, setCalendar] = useState(false);
  const log = useDayLog(day);
  const totals = useDayTotals(day);
  const target = useDayTarget(day);

  const entries = log.data ?? [];
  const byMeal = (m: Meal) => entries.filter((e) => e.meal === m);
  const eaten = totals.data ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <View style={{ gap: 4 }}>
            <Text variant="label" muted>
              {monthYearLabel(`${day.slice(0, 7)}-01`)}
            </Text>
            <Text variant="screenTitle">{t('diet.title')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconButton
              icon="more"
              accessibilityLabel={t('diet.goalsAndMode')}
              onPress={() => router.push('/diet-goals')}
            />
            <IconButton
              icon="calendar"
              accessibilityLabel={t('diet.openCalendar')}
              onPress={() => setCalendar(true)}
            />
          </View>
        </View>

        <DayStrip days={weekOf(day, weekStart)} selected={day} onSelect={setDay} />

        {target ? (
          <DaySummaryCard
            eaten={eaten}
            target={target}
            caption={t('diet.left', { kcal: Math.max(0, Math.round(target.kcal - eaten.kcal)) })}
          />
        ) : null}

        <View style={{ gap: 10 }}>
          {meals.map((meal) => (
            <MealSection
              key={meal}
              meal={meal}
              entries={byMeal(meal)}
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
  onAdd,
  onOpen,
}: {
  meal: Meal;
  entries: LogEntry[];
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
        borderRadius: radius.cardSmall,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surfaceAlt,
        paddingVertical: 6,
        paddingLeft: 16,
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
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text variant="bodyL" medium accessibilityRole="header">
            {name}
          </Text>
          <Text variant="label" muted>
            {entries.length > 0 ? t('diet.kcalValue', { kcal: Math.round(kcal) }) : '—'}
          </Text>
        </View>
        <IconButton
          icon="plus"
          accessibilityLabel={t('diet.addTo', { meal: name })}
          onPress={onAdd}
        />
      </View>
      {entries.map((e) => (
        <Pressable
          key={e.id}
          accessibilityRole="button"
          accessibilityLabel={`${e.name}, ${e.quantityLabel ?? ''} ${Math.round(e.macros.kcal)} ${t('common.kcal')}`}
          disabled={!e.foodId}
          onPress={() => onOpen(e)}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderTopWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.borderDecorative,
            paddingRight: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <View style={{ flex: 1, gap: 1, paddingVertical: 4 }}>
            <Text variant="bodyS" numberOfLines={1}>
              {e.name}
            </Text>
            <Text variant="label" muted>
              {e.quantityLabel ?? ''}
            </Text>
          </View>
          <Text variant="label">{String(Math.round(e.macros.kcal))}</Text>
        </Pressable>
      ))}
    </View>
  );
}
