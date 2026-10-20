import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { IconTile } from '@/components/ui/IconTile';
import { Input } from '@/components/ui/Input';
import { StatusChip } from '@/components/ui/StatusChip';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { mealForPosition } from '@/domain/diet';
import { MacroValues } from './MacroValues';
import { mealIcon } from './meal-icon';
import {
  macroKcal,
  rebalanceMeals,
  scaleMacros,
  splitDay,
  type MealRole,
  type Totals,
} from '@/domain/nutrition';
import { formatInt, parseDecimal } from '@/domain/numbers';
import { newId } from '@/lib/uuid';

export type MealDraft = {
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  description: string;
  isMain: boolean;
};

type Props = {
  meals: MealDraft[];
  onMealsChange: (next: MealDraft[]) => void;
  /** The daily target the meals must add up to; null = no target (DECISIONS 104): meals as typed. */
  goal: Totals | null;
  workoutAfter: string | null;
  onWorkoutAfterChange: (id: string | null) => void;
};

const macroOf = (m: MealDraft): Totals => ({
  kcal: m.kcal,
  proteinG: m.proteinG,
  carbsG: m.carbsG,
  fatG: m.fatG,
});

/**
 * Meals of the fixed-meals plan: where the workout sits, main meals, kcal/macros and what to eat.
 * The day always stays on target: editing a meal re-shares the rest between the other meals, and
 * Auto-split spreads the target (more to main meals, carbs before / protein after the workout).
 * Without a target the meals stay as typed (no re-share, no auto-split), only the day total shows.
 * Used by the plan editor and by the onboarding.
 */
export function MealPlanEditor({
  meals,
  onMealsChange,
  goal,
  workoutAfter,
  onWorkoutAfterChange,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState<string | null>(null);

  const sum = meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.proteinG, c: a.c + m.carbsG, f: a.f + m.fatG }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  const diff = goal ? Math.round(sum.kcal - goal.kcal) : 0;
  const matches = goal ? Math.abs(diff) <= Math.max(25, goal.kcal * 0.01) : true;

  const withParts = (parts: Totals[]) => meals.map((m, i) => ({ ...m, ...parts[i] }));
  const update = (id: string, patch: Partial<MealDraft>) =>
    onMealsChange(meals.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  // Roles of each meal for auto-split: the meal before the workout is the pre-workout one, the next the post.
  const workoutIndex = meals.findIndex((m) => m.id === workoutAfter);
  const roleOf = (i: number): MealRole['workout'] =>
    workoutIndex < 0 ? null : i === workoutIndex ? 'pre' : i === workoutIndex + 1 ? 'post' : null;

  const doAutoSplit = () => {
    if (!goal) return;
    onMealsChange(
      withParts(
        splitDay(
          goal,
          meals.map((m, i) => ({ isMain: m.isMain, workout: roleOf(i) })),
        ),
      ),
    );
  };

  // Calories always agree with the macros (4/4/9 per gram) and the day never leaves the target:
  // the other meals absorb the change. Editing the kcal scales the macros of that meal.
  const edit = (index: number, key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG', value: number) => {
    const m = meals[index];
    let next: Totals;
    if (key === 'kcal') {
      const current = macroKcal(m);
      next =
        current > 0
          ? { ...scaleMacros(m, value / current), kcal: value }
          : { ...macroOf(m), kcal: value };
    } else {
      next = { ...macroOf(m), [key]: value };
      next.kcal = Math.round(macroKcal(next));
    }
    const all = meals.map(macroOf);
    all[index] = next;
    onMealsChange(withParts(goal ? rebalanceMeals(goal, all, index) : all));
  };

  const remove = (id: string) => {
    const rest = meals.filter((x) => x.id !== id);
    const parts = goal ? rebalanceMeals(goal, rest.map(macroOf), -1) : rest.map(macroOf);
    onMealsChange(rest.map((m, i) => ({ ...m, ...parts[i] })));
    if (workoutAfter === id) onWorkoutAfterChange(null);
    setOpen(null);
  };

  const numField = (
    m: MealDraft,
    index: number,
    key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG',
    label: string,
  ) => (
    <View key={key} style={{ flex: 1 }}>
      <Input
        variant="compact"
        label={label}
        value={String(m[key])}
        onChangeText={(v) => edit(index, key, Math.max(0, Math.round(parseDecimal(v) ?? 0)))}
        keyboardType="number-pad"
        selectTextOnFocus
      />
    </View>
  );

  const mealCard = (m: MealDraft, index: number) => {
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
              onPress={() => remove(m.id)}
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
              <Text variant="bodyS" muted>
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
            {numField(m, index, 'kcal', t('diet.field.kcal'))}
            {numField(m, index, 'proteinG', t('diet.field.protein'))}
            {numField(m, index, 'carbsG', t('diet.field.carbs'))}
            {numField(m, index, 'fatG', t('diet.field.fat'))}
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
          minHeight: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: radius.cardSmall,
          borderWidth: 1,
          borderColor: colors.borderDecorative,
          backgroundColor: colors.surface,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        {/* The tile it has on the Diet tab (the first meal of the day is breakfast). */}
        <IconTile icon={mealIcon(mealForPosition(index))} area="nutrition" />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Text variant="body" semibold>
              {m.name}
            </Text>
            {m.isMain ? <StatusChip label={t('fixed.mainBadge')} /> : null}
          </View>
          <Text variant="bodyS" muted numeric>
            {t('diet.mealLine', {
              kcal: m.kcal,
              p: Math.round(m.proteinG),
              c: Math.round(m.carbsG),
              f: Math.round(m.fatG),
            })}
          </Text>
          {role ? <StatusChip area="training" label={t(`fixed.${role}`)} /> : null}
        </View>
        <Icon name="chevronRight" size={18} color={colors.textMuted} />
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
          borderRadius: radius.row,
          // The workout in training's colour (DECISIONS 107), between the meals around it.
          backgroundColor: colors.trainingSoft,
        }}
      >
        <Icon name="dumbbell" size={16} color={colors.trainingInk} />
        <Text variant="label" semibold style={{ color: colors.trainingInk }}>
          {t('fixed.workoutRow')}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ gap: 14 }}>
      {/* The day the meals add up to (DECISIONS 112): its kcal big, whether it matches the
          target as a chip (green with a tick when it does, the difference in words otherwise)
          and the macros in their colours. */}
      <Card size="small" gap={10}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="bodyS" muted>
              {t('fixed.dayTotal')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text variant="displayS" numeric>
                {formatInt(sum.kcal)}
              </Text>
              <Text variant="bodyS" muted>
                {t('common.kcal')}
              </Text>
            </View>
          </View>
          {goal ? (
            <Button
              label={t('fixed.autoSplit')}
              variant="secondary"
              block={false}
              onPress={doAutoSplit}
            />
          ) : null}
        </View>
        {goal ? (
          <StatusChip
            area={matches ? 'better' : 'neutral'}
            icon={matches ? 'check' : undefined}
            label={
              matches
                ? t('fixed.matches')
                : t('fixed.differs', { kcal: `${diff > 0 ? '+' : '−'}${Math.abs(diff)}` })
            }
          />
        ) : null}
        <MacroValues macros={{ protein: sum.p, carbs: sum.c, fat: sum.f }} />
      </Card>

      <ChipGroup
        legend={t('fixed.workoutWhere')}
        value={workoutAfter ?? 'none'}
        onChange={(v) => onWorkoutAfterChange(v === 'none' ? null : v)}
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
          onMealsChange([
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
    </View>
  );
}
