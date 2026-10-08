import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormHeader } from '@/components/ui/FormHeader';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { autoSplit, type Totals } from '@/domain/nutrition';
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
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!plan.data || !goal) return <Screen>{null}</Screen>;
  // Edits live in `draft`; until the first edit the meals come straight from the saved plan.
  const original = plan.data.meals.map(({ position: _p, ...m }) => m);
  const originalIds = original.map((m) => m.id);
  const meals = draft ?? original;
  const setMeals = (next: Draft[]) => setDraft(next);

  const planName = name ?? plan.data.name;
  const sum = meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.proteinG, c: a.c + m.carbsG, f: a.f + m.fatG }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  const diff = Math.round(sum.kcal - goal.kcal);
  const matches = Math.abs(diff) <= Math.max(25, goal.kcal * 0.01);

  const update = (id: string, patch: Partial<Draft>) =>
    setMeals(meals.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const doAutoSplit = () => {
    const parts = autoSplit(
      { kcal: goal.kcal, proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG },
      meals.map((m) => m.kcal || 1),
    );
    setMeals(
      meals.map((m, i) => {
        const p: Totals = parts[i];
        return { ...m, kcal: p.kcal, proteinG: p.proteinG, carbsG: p.carbsG, fatG: p.fatG };
      }),
    );
  };

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        planId: plan.data!.id,
        name: planName,
        meals,
        removedIds: originalIds.filter((id) => !meals.some((m) => m.id === id)),
      });
      goBack(router);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const numField = (m: Draft, key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG', label: string) => (
    <View key={key} style={{ flex: 1 }}>
      <Input
        variant="compact"
        label={label}
        value={String(m[key])}
        onChangeText={(v) => update(m.id, { [key]: Math.max(0, Math.round(parseDecimal(v) ?? 0)) })}
        keyboardType="number-pad"
        selectTextOnFocus
      />
    </View>
  );

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

        <View style={{ gap: 8 }}>
          {meals.map((m) =>
            open === m.id ? (
              <Card key={m.id} size="small" selected gap={12}>
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
            ) : (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={m.name}
                onPress={() => setOpen(m.id)}
                style={({ pressed }) => ({
                  minHeight: 60,
                  justifyContent: 'center',
                  gap: 2,
                  paddingHorizontal: 16,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.borderDecorative,
                  backgroundColor: colors.surfaceAlt,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text variant="body">{m.name}</Text>
                <Text variant="label" muted>
                  {t('diet.mealLine', {
                    kcal: m.kcal,
                    p: Math.round(m.proteinG),
                    c: Math.round(m.carbsG),
                    f: Math.round(m.fatG),
                  })}
                </Text>
              </Pressable>
            ),
          )}
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
