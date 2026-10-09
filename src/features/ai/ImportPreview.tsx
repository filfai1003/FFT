import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { matchExercise, type ParsedBundle } from '@/domain/plan-import';
import { useExercises } from '@/features/train/exercises';
import { usePlans } from '@/features/train/plans';

type Props = {
  bundle: ParsedBundle;
  onApply: () => void;
  busy: boolean;
  /** Shown instead of the button once applied. */
  done?: React.ReactNode;
};

/** What an import would do, before it does it: plans found, exercises matched, problems. */
export function ImportPreview({ bundle, onApply, busy, done }: Props) {
  const { t } = useTranslation();
  const exercises = useExercises();
  const plans = usePlans();
  const { workout, diet, errors, warnings } = bundle;

  const names = new Set(workout?.days.flatMap((d) => d.exercises.map((e) => e.name)) ?? []);
  let created = 0;
  let missing = 0;
  for (const name of names) {
    const e = workout?.days.flatMap((d) => d.exercises).find((x) => x.name === name);
    if (matchExercise(name, exercises.data ?? [])) continue;
    if (e?.newExercise) created++;
    else missing++;
  }
  const replaces = workout?.id ? plans.data?.find((p) => p.id === workout.id) : undefined;
  const canApply = errors.length === 0 && (workout != null || diet != null);

  return (
    <Card gap={10}>
      <Text variant="label" muted>
        {t('ai.preview')}
      </Text>

      {workout ? (
        <View style={{ gap: 2 }}>
          <Text variant="body">
            {replaces
              ? t('ai.updatesPlan', { name: replaces.name })
              : t('ai.newPlan', { name: workout.name })}
          </Text>
          <Text variant="label" muted>
            {t('ai.workoutSummary', {
              days: workout.days.length,
              exercises: workout.days.reduce((a, d) => a + d.exercises.length, 0),
            })}
          </Text>
          <Text variant="label" muted>
            {workout.days.map((d) => d.name).join(' · ')}
          </Text>
          {created > 0 ? (
            <Text variant="label" muted>
              {t('ai.willCreate', { count: created })}
            </Text>
          ) : null}
          {missing > 0 ? (
            <Text variant="bodyS" danger>
              {t('ai.notFound', { count: missing })}
            </Text>
          ) : null}
          {replaces ? (
            <Text variant="label" muted>
              {t('ai.backupNote')}
            </Text>
          ) : null}
        </View>
      ) : null}

      {diet ? (
        <View style={{ gap: 2 }}>
          <Text variant="body">{t('ai.dietTitle')}</Text>
          <Text variant="label" muted>
            {t('ai.dietSummary', {
              kcal: diet.kcal,
              p: diet.proteinG,
              c: diet.carbsG,
              f: diet.fatG,
              meals: diet.meals.length,
            })}
          </Text>
          <Text variant="label" muted>
            {t('ai.dietReplaces')}
          </Text>
        </View>
      ) : null}

      {errors.map((e) => (
        <Text key={e} variant="bodyS" danger accessibilityRole="alert">
          {e}
        </Text>
      ))}
      {warnings.map((w) => (
        <Text key={w} variant="bodyS" muted>
          {w}
        </Text>
      ))}

      {done ??
        (canApply ? (
          <Button
            label={busy ? t('ai.importing') : t('ai.import')}
            disabled={busy}
            onPress={onApply}
          />
        ) : null)}
    </Card>
  );
}
