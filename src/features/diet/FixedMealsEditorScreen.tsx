import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { FormHeader } from '@/components/ui/FormHeader';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { macroKcal, scaleMacros, splitDay, type MealRole } from '@/domain/nutrition';
import { parseDecimal } from '@/domain/numbers';
import { useToday } from '@/features/profile/use-today';
import { newId } from '@/lib/uuid';
import { useFixedPlan, useSaveFixedPlan, type FixedMeal } from './fixed';
import { useGoalForDay } from './log';
import { goBack } from '@/lib/navigation';

type Draft = Omit<FixedMeal, 'position'>;

/** Fixed meals editor: plan name, meals with kcal/macros and a description, auto-split. */
export function FixedMealsEditorScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const today = useToday();
  const goal = useGoalForDay(today);
  const plan = useFixedPlan();
  const save = useSaveFixedPlan();
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [workoutDraft, setWorkoutDraft] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!plan.data || !goal) return <Screen>{null}</Screen>;
  // Edits live in `draft`; until the first edit the meals come straight from the saved plan.
  const original = plan.data.meals.map(({ position: _p, ...m }) => m);
  const originalIds = original.map((m) => m.id);
  const meals = draft ?? original;
  const setMeals = (next: Draft[]) => setDraft(next);

  const planName = name ?? plan.data.name;
  const requested = workoutDraft === undefined ? plan.data.workoutAfterMealId : workoutDraft;
  // A deleted meal cannot hold the workout any more.
  const workoutAfter = meals.some((m) => m.id === requested) ? requested : null;
  const sum = meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.proteinG, c: a.c + m.carbsG, f: a.f + m.fatG }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  const diff = Math.round(sum.kcal - goal.kcal);
  const matches = Math.abs(diff) <= Math.max(25, goal.kcal * 0.01);

  const update = (id: string, patch: Partial<Draft>) =>
    setMeals(meals.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  // Roles of each meal for auto-split: the meal before the workout is the pre-workout one, the next the post.
  const workoutIndex = meals.findIndex((m) => m.id === workoutAfter);
  const roleOf = (i: number): MealRole['workout'] =>
    workoutIndex < 0 ? null : i === workoutIndex ? 'pre' : i === workoutIndex + 1 ? 'post' : null;

  const doAutoSplit = () => {
    const parts = splitDay(
      { kcal: goal.kcal, proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG },
      meals.map((m, i) => ({ isMain: m.isMain, workout: roleOf(i) })),
    );
    setMeals(meals.map((m, i) => ({ ...m, ...parts[i] })));
  };

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        planId: plan.data!.id,
        name: planName,
        meals,
        workoutAfterMealId: workoutAfter,
        removedIds: originalIds.filter((id) => !meals.some((m) => m.id === id)),
      });
      goBack(router);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Calories always agree with the macros: editing a macro recalculates the kcal (4/4/9 per gram);
  // editing the kcal scales the macros proportionally (when there are any).
  const edit = (m: Draft, key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG', value: number) => {
    if (key !== 'kcal') {
      const next = { ...m, [key]: value };
      update(m.id, { [key]: value, kcal: Math.round(macroKcal(next)) });
      return;
    }
    const current = macroKcal(m);
    update(
      m.id,
      current > 0 ? { ...scaleMacros(m, value / current), kcal: value } : { kcal: value },
    );
  };

  const numField = (m: Draft, key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG', label: string) => (
    <View key={key} style={{ flex: 1 }}>
      <Input
        variant="compact"
        label={label}
        value={String(m[key])}
        onChangeText={(v) => edit(m, key, Math.max(0, Math.round(parseDecimal(v) ?? 0)))}
        keyboardType="number-pad"
        selectTextOnFocus
      />
    </View>
  );

  const mealCard = (m: Draft, index: number) => {
    const role = roleOf(index);
    if (open === m.id) {
      return (
        <Card size="small" selected gap={12}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                accessibilityLabel={t('fixed.mealName')}
                value={m.name}
                onChangeText={(v) => update(m.id, { name: v })}
              />
            </View>
            <IconButton
              icon="trash"
              accessibilityLabel={t('fixed.deleteMeal', { name: m.name })}
              disabled={meals.length <= 1}
              onPress={() => {
                setMeals(meals.filter((x) => x.id !== m.id));
                setOpen(null);
              }}
            />
          </View>
          <View
            style={{
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text>{t('fixed.mainMeal')}</Text>
              <Text variant="label" muted>
                {t('fixed.mainMealDetail')}
              </Text>
            </View>
            <Toggle
              value={m.isMain}
              onValueChange={(v) => update(m.id, { isMain: v })}
              accessibilityLabel={t('fixed.mainMeal')}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {numField(m, 'kcal', t('diet.field.kcal'))}
            {numField(m, 'proteinG', t('diet.field.protein'))}
            {numField(m, 'carbsG', t('diet.field.carbs'))}
            {numField(m, 'fatG', t('diet.field.fat'))}
          </View>
          <Input
            accessibilityLabel={t('fixed.whatYouEat')}
            placeholder={t('fixed.whatYouEat')}
            value={m.description}
            onChangeText={(v) => update(m.id, { description: v })}
          />
          <Button label={t('fixed.done')} variant="secondary" onPress={() => setOpen(null)} />
        </Card>
      );
    }
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={m.isMain ? `${m.name}, ${t('fixed.mainBadge')}` : m.name}
        onPress={() => setOpen(m.id)}
        style={({ pressed }) => ({
          minHeight: 60,
          justifyContent: 'center',
          gap: 2,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.borderDecorative,
          backgroundColor: colors.surfaceAlt,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="body">{m.name}</Text>
          {m.isMain ? (
            <Text variant="label" muted>
              {t('fixed.mainBadge')}
            </Text>
          ) : null}
        </View>
        <Text variant="label" muted>
          {t('diet.mealLine', {
            kcal: m.kcal,
            p: Math.round(m.proteinG),
            c: Math.round(m.carbsG),
            f: Math.round(m.fatG),
          })}
        </Text>
        {role ? (
          <Text variant="label" muted>
            {t(`fixed.${role}`)}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const workoutRow = (index: number) => {
    const next = meals[index + 1];
    return (
      <View
        accessible
        accessibilityLabel={
          next
            ? t('fixed.workoutRowLabel', { before: meals[index].name, after: next.name })
            : t('fixed.workoutRowEnd', { before: meals[index].name })
        }
        style={{
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: 14,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.borderControl,
        }}
      >
        <Icon name="train" size={16} color={colors.text} />
        <Text variant="label">{t('fixed.workoutRow')}</Text>
      </View>
    );
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router) }}
          title={t('fixed.title')}
        />
        <Input label={t('fixed.planName')} value={planName} onChangeText={setName} display />

        <Card size="small" gap={8}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="label" muted>
                {matches
                  ? t('fixed.matches')
                  : t('fixed.differs', { kcal: `${diff > 0 ? '+' : '−'}${Math.abs(diff)}` })}
              </Text>
              <Text variant="label">
                {t('fixed.sumLine', {
                  kcal: Math.round(sum.kcal),
                  p: Math.round(sum.p),
                  c: Math.round(sum.c),
                  f: Math.round(sum.f),
                })}
              </Text>
            </View>
            <Button
              label={t('fixed.autoSplit')}
              variant="secondary"
              block={false}
              onPress={doAutoSplit}
            />
          </View>
        </Card>
        <Text variant="bodyS" muted>
          {t('fixed.autoSplitNote')}
        </Text>

        <ChipGroup
          legend={t('fixed.workoutWhere')}
          value={workoutAfter ?? 'none'}
          onChange={(v) => setWorkoutDraft(v === 'none' ? null : v)}
          options={[
            { value: 'none', label: t('fixed.workoutNone') },
            ...meals.map((m) => ({ value: m.id, label: m.name || t('fixed.mealName') })),
          ]}
        />

        <View style={{ gap: 8 }}>
          {meals.map((m, index) => (
            <View key={m.id} style={{ gap: 8 }}>
              {mealCard(m, index)}
              {m.id === workoutAfter ? workoutRow(index) : null}
            </View>
          ))}
        </View>

        <Button
          label={t('fixed.addMeal')}
          variant="secondary"
          onPress={() => {
            const id = newId();
            setMeals([
              ...meals,
              {
                id,
                name: t('fixed.newMealName', { n: meals.length + 1 }),
                kcal: 0,
                proteinG: 0,
                carbsG: 0,
                fatG: 0,
                description: '',
                isMain: false,
              },
            ]);
            setOpen(id);
          }}
        />
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button
          size="large"
          label={t('fixed.save')}
          disabled={
            planName.trim() === '' || meals.some((m) => m.name.trim() === '') || save.isPending
          }
          onPress={submit}
        />
      </BottomActionBar>
    </>
  );
}
