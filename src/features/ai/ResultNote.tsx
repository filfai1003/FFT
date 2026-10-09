import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import type { ApplyResult } from './apply';

/** After an import: what was done, and where to find it. */
export function ResultNote({ result, from }: { result: ApplyResult; from: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="body">{t('ai.done')}</Text>
      {result.workoutPlanId ? (
        <Text variant="label" muted>
          {result.workoutUpdated ? t('ai.doneUpdated') : t('ai.doneCreated')}
        </Text>
      ) : null}
      {result.backupName ? (
        <Text variant="label" muted>
          {t('ai.doneBackup', { name: result.backupName })}
        </Text>
      ) : null}
      {result.createdExercises > 0 ? (
        <Text variant="label" muted>
          {t('ai.doneExercises', { count: result.createdExercises })}
        </Text>
      ) : null}
      {result.skippedExercises.length > 0 ? (
        <Text variant="bodyS" danger>
          {t('ai.doneSkipped', { names: result.skippedExercises.join(', ') })}
        </Text>
      ) : null}
      {result.dietApplied ? (
        <Text variant="label" muted>
          {t('ai.doneDiet')}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {result.workoutPlanId ? (
          <Button
            label={t('ai.openPlan')}
            variant="secondary"
            block={false}
            onPress={() =>
              router.push({
                pathname: '/train/plan/[planId]',
                params: { planId: result.workoutPlanId!, from },
              })
            }
          />
        ) : null}
        {result.dietApplied ? (
          <Button
            label={t('ai.openDiet')}
            variant="secondary"
            block={false}
            onPress={() => router.push('/diet')}
          />
        ) : null}
      </View>
    </View>
  );
}
