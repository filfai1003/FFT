import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { mealForHour, meals, type Meal } from '@/domain/diet';
import { useToday } from '@/features/profile/use-today';
import { MealSheet } from './MealSheet';
import { QuickAddSheet } from './QuickAddSheet';
import { useFoodSearch, useMyFoods, useRecentFoods, type Food } from './foods';
import { mergeFoods, useOffSearch } from './off';
import { goBack } from '@/lib/navigation';

type Tab = 'results' | 'recent' | 'mine';

/** Search foods (our database + Open Food Facts), recents and your own; "+" adds in one tap. */
export function FoodSearchScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const params = useLocalSearchParams<{ meal?: string; day?: string }>();
  const [meal, setMeal] = useState<Meal>(
    meals.includes(params.meal as Meal)
      ? (params.meal as Meal)
      : mealForHour(new Date().getHours()),
  );
  const day = params.day ?? today;

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('results');
  const [mealSheet, setMealSheet] = useState(false);
  const [quick, setQuick] = useState<Food | null>(null);

  const local = useFoodSearch(query);
  const recent = useRecentFoods();
  const mine = useMyFoods();
  const off = useOffSearch(query, tab === 'results' && (local.data?.length ?? 0) < 8);

  const q = query.trim();
  const results = tab === 'results' && q.length >= 2 ? mergeFoods(local.data, off.data) : [];
  const list: Food[] =
    tab === 'recent'
      ? (recent.data ?? [])
      : tab === 'mine'
        ? (mine.data ?? [])
        : q.length >= 2
          ? results
          : (recent.data ?? []);
  const loading =
    tab === 'results' && q.length >= 2 && (local.isFetching || off.isFetching) && list.length === 0;

  const open = (food: Food) =>
    router.push({
      pathname: '/food/[foodId]',
      params: { foodId: food.id, meal, day },
    });

  return (
    <>
      <Screen scroll gap={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconButton
            icon="chevronLeft"
            accessibilityLabel={t('diet.backToLog')}
            onPress={() => goBack(router)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('diet.addToLabel')} ${t(`diet.meal.${meal}`)}. ${t('diet.changeMeal')}`}
            onPress={() => setMealSheet(true)}
            style={{ gap: 2, minHeight: touch.minTarget, justifyContent: 'center' }}
          >
            <Text variant="label" muted>
              {t('diet.addToLabel')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="displayS">{t(`diet.meal.${meal}`)}</Text>
              <Icon name="chevronDown" size={16} color={colors.textMuted} />
            </View>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Input
              variant="search"
              accessibilityLabel={t('diet.searchFood')}
              placeholder={t('diet.searchFood')}
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                if (tab !== 'results') setTab('results');
              }}
              autoCorrect={false}
            />
          </View>
          <IconButton
            icon="scan"
            size={52}
            accessibilityLabel={t('diet.scan')}
            onPress={() => router.push({ pathname: '/scanner', params: { meal, day } })}
          />
        </View>

        <View
          accessibilityRole="tablist"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
        >
          {(['results', 'recent', 'mine'] as const).map((k) => (
            <Chip
              key={k}
              role="radio"
              label={t(`diet.tab.${k}`)}
              selected={tab === k}
              onPress={() => setTab(k)}
            />
          ))}
        </View>

        <View>
          {loading ? <Text muted>{t('diet.searching')}</Text> : null}
          {!loading && list.length === 0 ? (
            <Text muted>
              {tab === 'results' && q.length < 2 ? t('diet.typeToSearch') : t('diet.noFoods')}
            </Text>
          ) : null}
          {list.map((f) => (
            <View
              key={f.id}
              style={{
                minHeight: 64,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderBottomWidth: 1,
                borderColor: colors.borderDecorative,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${f.name}, ${Math.round(f.per100.kcal)} ${t('common.kcal')}`}
                onPress={() => open(f)}
                style={{ flex: 1, minHeight: 64, justifyContent: 'center', gap: 3 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {f.name}
                  </Text>
                  {f.verified ? (
                    <View
                      accessibilityLabel={t('diet.verified')}
                      style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text }}
                    />
                  ) : null}
                </View>
                <Text variant="label" muted>
                  {t('diet.per100', {
                    p: round(f.per100.protein),
                    c: round(f.per100.carbs),
                    f: round(f.per100.fat),
                  })}
                </Text>
              </Pressable>
              <Text variant="displayS" numeric>
                {Math.round(f.per100.kcal)}
              </Text>
              <IconButton
                icon="plus"
                accessibilityLabel={t('diet.chooseAmount', { name: f.name })}
                onPress={() => setQuick(f)}
              />
            </View>
          ))}
        </View>

        <Button
          label={t('diet.createFood')}
          variant="ghost"
          onPress={() => router.push({ pathname: '/food/new', params: { meal, day } })}
        />
        <View style={{ height: 24 }} />
      </Screen>

      <MealSheet
        visible={mealSheet}
        value={meal}
        onClose={() => setMealSheet(false)}
        onChange={setMeal}
      />
      <QuickAddSheet food={quick} meal={meal} day={day} onClose={() => setQuick(null)} />
    </>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
