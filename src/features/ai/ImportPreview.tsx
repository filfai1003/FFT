import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { matchExercise, type ParsedBundle } from '@/domain/plan-import';
import { useGoalForDay } from '@/features/diet/log';
import { useFixedPlan } from '@/features/diet/fixed';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useExercises } from '@/features/train/exercises';
import { DietDetail } from './DietDetail';
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
  const profile = useProfile();
  const goal = useGoalForDay(useToday());
  const fixed = useFixedPlan();
  const [confirming, setConfirming] = useState(false);
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
        <View style={{ gap: 6 }}>
          <Text variant="body">{t('ai.dietTitle')}</Text>
          <DietDetail diet={diet} />
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
            onPress={diet ? () => setConfirming(true) : onApply}
          />
        ) : null)}

      {diet ? (
        <Sheet
          visible={confirming}
          onClose={() => setConfirming(false)}
          title={t('ai.confirmDietTitle')}
          closeLabel={t('common.close')}
          footer={
            <View style={{ gap: 8 }}>
              <Button
                size="large"
                label={t('ai.confirmDietYes')}
                disabled={busy}
                onPress={() => {
                  setConfirming(false);
                  onApply();
                }}
              />
              <Button
                label={t('common.cancel')}
                variant="ghost"
                onPress={() => setConfirming(false)}
              />
            </View>
          }
        >
          <Text muted>{t('ai.confirmDietBody')}</Text>
          <View style={{ gap: 4 }}>
            <Text variant="label" muted>
              {t('ai.currentDiet')}
            </Text>
            <Text variant="bodyS">
              {goal
                ? t('ai.currentLine', {
                    mode:
                      profile.data?.diet_mode === 'tracking'
                        ? t('ai.modeTrackingShort')
                        : t('ai.modeFixedShort'),
                    kcal: goal.kcal,
                    p: goal.proteinG,
                    c: goal.carbsG,
                    f: goal.fatG,
                    meals:
                      profile.data?.diet_mode === 'tracking' ? 0 : (fixed.data?.meals.length ?? 0),
                  })
                : t('ai.noCurrentDiet')}
            </Text>
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="label" muted>
              {t('ai.newDiet')}
            </Text>
            <DietDetail diet={diet} />
          </View>
        </Sheet>
      ) : null}
    </Card>
  );
}
