import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormHeader } from '@/components/ui/FormHeader';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { recipeNutrition, scaleNutrition } from '@/domain/diet';
import { parseDecimal } from '@/domain/numbers';
import {
  draftFromRecipe,
  newDraft,
  removeIngredient,
  setGrams,
  useRecipeDraftStore,
} from './recipe-draft';
import { useDeleteRecipe, useRecipes, useSaveRecipe } from './recipes';
import { goBack } from '@/lib/navigation';

/** Your recipes; "+" starts a new one, the round "+" on a row logs a serving. */
export function RecipesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; day?: string; mode?: string }>();
  const recipes = useRecipes();
  const [query, setQuery] = useState('');
  const list = (recipes.data ?? []).filter((r) =>
    r.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Screen scroll gap={14}>
      <TopBar
        onBack={() => goBack(router)}
        backLabel={t('diet.backToSearch')}
        right={
          <IconButton
            icon="plus"
            accessibilityLabel={t('recipes.new')}
            onPress={() =>
              router.push({ pathname: '/recipe/[recipeId]', params: { recipeId: 'new' } })
            }
          />
        }
      />
      <Text variant="screenTitle">{t('recipes.title')}</Text>
      <Input
        variant="search"
        accessibilityLabel={t('recipes.search')}
        placeholder={t('recipes.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
      />
      {list.length === 0 ? <Text muted>{t('recipes.empty')}</Text> : null}
      <View style={{ gap: 10 }}>
        {list.map((r) => (
          <View
            key={r.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 12,
              paddingLeft: 16,
              paddingRight: 8,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.borderDecorative,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={r.name}
              onPress={() =>
                router.push({ pathname: '/recipe/[recipeId]', params: { recipeId: r.id } })
              }
              style={{ flex: 1, gap: 4, minHeight: 44, justifyContent: 'center' }}
            >
              <Text variant="bodyL" medium>
                {r.name}
              </Text>
              <Text variant="label" muted style={{ letterSpacing: 0.3 }}>
                {t('recipes.line', {
                  servings: r.servings,
                  p: r.perServing.protein,
                  c: r.perServing.carbs,
                  f: r.perServing.fat,
                })}
              </Text>
            </Pressable>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text variant="displayS" numeric>
                {r.perServing.kcal}
              </Text>
              <Text variant="label" muted>
                {t('recipes.kcalServing')}
              </Text>
            </View>
            <IconButton
              icon="plus"
              accessibilityLabel={t('recipes.logServing', { name: r.name })}
              onPress={() =>
                router.push({
                  pathname: '/food/[foodId]',
                  params: { foodId: r.id, kind: 'recipe', meal: params.meal, day: params.day },
                })
              }
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

/** Recipe editor: name, servings, ingredients (grams) and the per-serving nutrition. */
export function RecipeEditorScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const recipes = useRecipes();
  const draft = useRecipeDraftStore((s) => s.draft);
  const setDraft = useRecipeDraftStore((s) => s.set);
  const patch = useRecipeDraftStore((s) => s.patch);
  const save = useSaveRecipe();
  const remove = useDeleteRecipe();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load once per opening; the search/detail screens add ingredients to the same draft.
  useEffect(() => {
    const current = useRecipeDraftStore.getState().draft;
    if (recipeId === 'new') {
      if (!current || !current.isNew) setDraft(newDraft());
      return;
    }
    if (current?.id === recipeId) return;
    const found = recipes.data?.find((r) => r.id === recipeId);
    if (found) setDraft(draftFromRecipe(found));
  }, [recipeId, recipes.data, setDraft]);

  useEffect(() => () => setDraft(null), [setDraft]);

  if (!draft) return <Screen>{null}</Screen>;

  const n = recipeNutrition(
    draft.items.map((i) => ({ per100: i.food.per100, grams: i.grams })),
    draft.servings,
  );
  const valid = draft.name.trim().length > 0 && draft.items.length > 0;

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        id: draft.id,
        name: draft.name,
        servings: draft.servings,
        items: draft.items.map((i) => ({ id: i.id, foodId: i.foodId, grams: i.grams })),
        removedItemIds: draft.removedItemIds,
      });
      goBack(router);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router) }}
          title={t('recipes.recipe')}
        />
        <Input
          label={t('recipes.name')}
          value={draft.name}
          onChangeText={(name) => patch((d) => ({ ...d, name }))}
          autoCapitalize="sentences"
        />

        <Card gap={12}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ gap: 4 }}>
              <Text variant="label" muted>
                {t('recipes.perServing')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text variant="displayL" numeric>
                  {n.perServing.kcal}
                </Text>
                <Text variant="label" muted>
                  {t('common.kcal')}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'center', gap: 4, width: 150 }}>
              <Text variant="label" muted>
                {t('recipes.servings')}
              </Text>
              <Stepper
                value={draft.servings}
                min={1}
                max={50}
                onChange={(servings) => patch((d) => ({ ...d, servings }))}
                decreaseLabel={t('recipes.fewerServings')}
                increaseLabel={t('recipes.moreServings')}
              />
            </View>
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.borderDecorative,
              paddingTop: 12,
            }}
          >
            {(['protein', 'carbs', 'fat'] as const).map((k) => (
              <Text key={k} variant="label">
                <Text variant="label" muted>
                  {t(`recipes.short.${k}`)}{' '}
                </Text>
                {`${n.perServing[k]} g`}
              </Text>
            ))}
          </View>
        </Card>

        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 4 }}>
            <Text variant="label" muted>
              {t('recipes.ingredients')}
            </Text>
            <Text variant="label" muted>
              {t('recipes.totalKcal', { kcal: Math.round(n.total.kcal) })}
            </Text>
          </View>
          {draft.items.map((i) => (
            <View
              key={i.id}
              style={{
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderBottomWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.borderDecorative,
              }}
            >
              <Text variant="bodyS" style={{ flex: 1 }} numberOfLines={2}>
                {i.food.name}
              </Text>
              <View style={{ width: 86 }}>
                <Input
                  variant="compact"
                  accessibilityLabel={t('recipes.gramsOf', { name: i.food.name })}
                  value={String(i.grams)}
                  onChangeText={(v) => {
                    const g = parseDecimal(v);
                    if (g != null && g > 0) patch((d) => setGrams(d, i.id, g));
                  }}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
              </View>
              <Text variant="label" style={{ width: 44, textAlign: 'right' }}>
                {Math.round(scaleNutrition(i.food.per100, i.grams).kcal)}
              </Text>
              <IconButton
                icon="trash"
                accessibilityLabel={t('recipes.removeIngredient', { name: i.food.name })}
                onPress={() => patch((d) => removeIngredient(d, i.id))}
              />
            </View>
          ))}
          <View style={{ height: 10 }} />
          <Button
            label={t('recipes.addIngredient')}
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/food-search', params: { mode: 'ingredient' } })
            }
          />
        </View>

        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {!draft.isNew ? (
          <>
            <Button
              label={t('recipes.logServingButton')}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/food/[foodId]',
                  params: { foodId: draft.id, kind: 'recipe' },
                })
              }
            />
            <Button
              label={t('recipes.delete')}
              variant="danger"
              onPress={() => setConfirmDelete(true)}
            />
          </>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button
          size="large"
          label={t('recipes.save')}
          disabled={!valid || save.isPending}
          onPress={submit}
        />
      </BottomActionBar>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('recipes.deleteTitle')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            variant="danger"
            label={t('recipes.deleteConfirm')}
            onPress={async () => {
              await remove.mutateAsync(draft.id);
              setConfirmDelete(false);
              goBack(router);
            }}
          />
        }
      >
        <Text muted>{t('recipes.deleteBody')}</Text>
      </Sheet>
    </>
  );
}
