import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import type { WeightUnit } from '@/domain/units';
import { trimNumber, type SessionExercise } from './logic';

/**
 * The next weight suggestion of the exercise on screen (version A of the design: the sets already
 * start at the suggested weight; "Keep 80" goes back to last time's).
 */
export function SuggestionCard({
  exercise,
  unit,
  onKeep,
}: {
  exercise: SessionExercise;
  unit: WeightUnit;
  onKeep: (keep: boolean) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const g = exercise.suggestion;
  if (!g) return null;
  const w = (n: number) => `${trimNumber(n)} ${unit}`;
  const step = trimNumber(Math.abs(g.to - g.from));
  const why = t('session.suggest.last', { weight: w(g.from), reps: g.reps.join(', ') });

  const title = g.kept
    ? t('session.suggest.kept', { weight: w(g.from) })
    : g.kind === 'up'
      ? t('session.suggest.up', { step, unit })
      : g.kind === 'down'
        ? t('session.suggest.down', { weight: w(g.to) })
        : t('session.suggest.same');
  const reason = g.kept
    ? why
    : g.kind === 'up'
      ? `${why}: ${t('session.suggest.reached')}`
      : g.kind === 'down'
        ? `${why}: ${t('session.suggest.short')}`
        : `${why}: ${t('session.suggest.oneMore')}`;

  return (
    <Card size="small" gap={0}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon
          name={g.kind === 'down' ? 'arrowDown' : g.kind === 'up' ? 'arrowUp' : 'check'}
          size={20}
          color={colors.text}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" numeric style={{ fontWeight: '600' }}>
            {title}
          </Text>
          <Text variant="label" muted numeric>
            {reason}
          </Text>
        </View>
        {g.kind !== 'same' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              g.kept
                ? t('session.suggest.useLabel', { weight: w(g.to) })
                : t('session.suggest.keepLabel', { weight: w(g.from) })
            }
            onPress={() => onKeep(!g.kept)}
            hitSlop={8}
            style={({ pressed }) => ({
              minHeight: touch.minTarget,
              justifyContent: 'center',
              paddingHorizontal: 4,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text variant="label" numeric style={{ textDecorationLine: 'underline' }}>
              {g.kept
                ? t('session.suggest.use', { weight: trimNumber(g.to) })
                : t('session.suggest.keep', { weight: trimNumber(g.from) })}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}
