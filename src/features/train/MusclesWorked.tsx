import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { InfoButton } from '@/components/ui/InfoButton';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { INVOLVEMENT_SHARE, involvements, type Involvement, type Muscle } from '@/domain/muscles';
import type { Exercise } from './exercises';

/** Marks of a level: 4 of 4 filled for the main muscle, 2 for a helper, 1 for a steadier. */
const MARKS = 4;

/**
 * Four small squares filled by the share of a set the level gets. Decoration only: the words
 * next to them ("Main · 1 set") say the same (never colour alone).
 */
function LevelMarks({ level }: { level: Involvement }) {
  const { colors } = useTheme();
  const filled = INVOLVEMENT_SHARE[level] * MARKS;
  return (
    <View aria-hidden style={{ flexDirection: 'row', gap: 2, paddingTop: 4 }}>
      {Array.from({ length: MARKS }, (_, i) => (
        <View
          key={i}
          style={{
            width: 7,
            height: 12,
            borderRadius: 2,
            backgroundColor: i < filled ? colors.training : colors.dotOff,
          }}
        />
      ))}
    </View>
  );
}

/**
 * "Muscles worked" on the exercise page (DECISIONS 125): the main muscle, the muscles that help
 * and the ones that steady, each level with its marks, its word and its share of a set.
 */
export function MusclesWorked({
  exercise,
}: {
  exercise: Pick<Exercise, 'primaryMuscle' | 'secondaryMuscles' | 'indirectMuscles'>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const byLevel: Record<Involvement, readonly Muscle[]> = {
    primary: [exercise.primaryMuscle],
    secondary: exercise.secondaryMuscles,
    indirect: exercise.indirectMuscles,
  };
  const levels = involvements.filter((l) => byLevel[l].length > 0);
  return (
    <Card size="small" gap={10}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text variant="bodyS" muted accessibilityRole="header" style={{ flex: 1 }}>
          {t('exerciseDetail.musclesWorked')}
        </Text>
        <InfoButton topic="muscleLevels" />
      </View>
      {levels.map((level, i) => {
        const names = byLevel[level].map((m) => t(`library.muscle.${m}`)).join(', ');
        return (
          <View
            key={level}
            accessible
            accessibilityLabel={t('exerciseDetail.levelA11y', {
              level: t(`exerciseDetail.level.${level}`),
              share: t(`exerciseDetail.levelShareA11y.${level}`),
              muscles: names,
            })}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 10,
              paddingTop: i === 0 ? 0 : 10,
              borderTopWidth: i === 0 ? 0 : 1,
              borderColor: colors.divider,
            }}
          >
            <LevelMarks level={level} />
            <View style={{ width: 92 }}>
              <Text variant="bodyS" semibold>
                {t(`exerciseDetail.level.${level}`)}
              </Text>
              <Text variant="label" muted>
                {t(`exerciseDetail.levelShare.${level}`)}
              </Text>
            </View>
            <Text variant="bodyS" style={{ flex: 1 }}>
              {names}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}
