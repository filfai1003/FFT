import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard';
import { Screen } from '@/components/ui/Screen';
import { SkeletonGroup, SkeletonRows } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { mealForHour, meals, type Meal } from '@/domain/diet';
import { useToday } from '@/features/profile/use-today';
import { AddButton } from './AddButton';
import { MealSheet } from './MealSheet';
import { VerifiedTick } from './VerifiedTick';
import { QuickAddSheet } from './QuickAddSheet';
import { useFoodSearch, useMyFoods, useRecentFoods, type Food } from './foods';
import { mergeFoods, useOffSearch } from './off';
import { goBack } from '@/lib/navigation';

type Tab = 'results' | 'recent' | 'mine';

/** Search foods (our database + Open Food Facts), recents and your own; "+" adds in one tap. */
export function FoodSearchScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
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
  // null = picked for you: Recent while nothing is typed (and there are recents), else Results.
  const [chosen, setTab] = useState<Tab | null>(null);
  const [mealSheet, setMealSheet] = useState(false);
  const [quick, setQuick] = useState<Food | null>(null);

  const local = useFoodSearch(query);
  const recent = useRecentFoods();
  const tab: Tab =
    chosen ?? (query.trim() === '' && (recent.data?.length ?? 0) > 0 ? 'recent' : 'results');
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

  const createFood = () => router.push({ pathname: '/food/new', params: { meal, day } });
  const open = (food: Food) =>
    router.push({
      pathname: '/food/[foodId]',
      params: { foodId: food.id, meal, day },
    });

  return (
    <>
      {/* Header, search and tabs stay put; only the results scroll. */}
      <Screen gap={14} style={{ paddingBottom: 0 }}>
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
            <Text variant="bodyS" muted>
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
                // Typing shows Results (and clearing the field goes back to Recent).
                setTab(null);
              }}
              autoCorrect={false}
              // Opened to add a food: the keyboard is up, ready to type.
              autoFocus
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

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 + bottom }}
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <SkeletonGroup accessibilityLabel={t('diet.searching')}>
              <SkeletonRows count={5} />
            </SkeletonGroup>
          ) : null}
          {!loading && list.length === 0 ? (
            // Each empty list says why and offers the way on (create the food).
            <View style={{ paddingTop: 12 }}>
              <EmptyState
                compact
                icon={tab === 'mine' ? 'edit' : 'search'}
                area="nutrition"
                title={
                  tab === 'mine'
                    ? t('diet.noMineTitle')
                    : tab === 'recent'
                      ? t('diet.noRecentTitle')
                      : q.length < 2
                        ? t('diet.searchTitle')
                        : t('diet.noResultsTitle')
                }
                body={
                  tab === 'mine'
                    ? t('diet.noMineBody')
                    : tab === 'recent'
                      ? t('diet.noRecentBody')
                      : q.length < 2
                        ? t('diet.typeToSearch')
                        : t('diet.noResultsBody')
                }
                action={{ label: t('diet.createFood'), onPress: createFood }}
              />
            </View>
          ) : null}
          {list.map((f) => (
            <FoodRow key={f.id} food={f} onOpen={() => open(f)} onAdd={() => setQuick(f)} />
          ))}
          {list.length > 0 ? (
            <Button
              label={t('diet.createFood')}
              variant="ghost"
              onPress={createFood}
              style={{ marginTop: 14 }}
            />
          ) : null}
        </KeyboardAwareScrollView>
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

/**
 * One result (canvas "Food search"): a tile with the food's initial, its name with a green tick
 * when verified, the macros per 100 g, the kcal per 100 g, and "+" to pick an amount here.
 */
function FoodRow({
  food: f,
  onOpen,
  onAdd,
}: {
  food: Food;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const initial = f.name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={{
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 1,
        borderColor: colors.borderDecorative,
      }}
    >
      <View
        aria-hidden
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          backgroundColor: colors.nutritionSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="body" semibold style={{ color: colors.nutritionInk }}>
          {initial}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${f.name}${f.verified ? `, ${t('diet.verified')}` : ''}, ${Math.round(f.per100.kcal)} ${t('common.kcal')}`}
        onPress={onOpen}
        style={{ flex: 1, minHeight: 64, justifyContent: 'center', gap: 3 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
            {f.name}
          </Text>
          {f.verified ? <VerifiedTick /> : null}
        </View>
        <Text variant="bodyS" muted numberOfLines={2}>
          {t('diet.per100', {
            p: round(f.per100.protein),
            c: round(f.per100.carbs),
            f: round(f.per100.fat),
          })}
        </Text>
      </Pressable>
      <View aria-hidden style={{ alignItems: 'flex-end' }}>
        <Text variant="displayS" numeric>
          {Math.round(f.per100.kcal)}
        </Text>
        <Text variant="label" muted>
          {t('common.kcal')}
        </Text>
      </View>
      <AddButton
        filled
        accessibilityLabel={t('diet.chooseAmount', { name: f.name })}
        onPress={onAdd}
      />
    </View>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
