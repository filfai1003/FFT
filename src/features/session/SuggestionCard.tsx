import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { InfoButton } from '@/components/ui/InfoButton';
import { Text } from '@/components/ui/Text';
import { radius, touch } from '@/design/tokens';
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
  const drops = (exercise.dropSuggestions ?? []).map((d, k) =>
    d
      ? d.kind === 'same'
        ? t('session.suggest.dropSame', { n: k + 1, weight: trimNumber(d.to) })
        : t('session.suggest.dropTo', { n: k + 1, from: trimNumber(d.from), to: trimNumber(d.to) })
      : null,
  );
  const dropLine = drops.some(Boolean) ? drops.filter(Boolean).join(' · ') : null;
  if (!g && !dropLine) return null;
  if (!g)
    return (
      <Card size="small" gap={2}>
        <Text variant="label" muted>
          {t('session.suggest.drops')}
        </Text>
        <Text variant="bodyS" numeric>
          {`${dropLine} ${unit}`}
        </Text>
      </Card>
    );
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

  // A step up (and not kept back) is progress: green panel with a filled arrow (canvas). Going
  // down or staying is neutral: never red, it is the right call when the target was missed.
  const up = g.kind === 'up' && !g.kept;
  return (
    <View
      testID="suggestion"
      style={{
        borderRadius: radius.cardSmall,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: up ? colors.successSoft : colors.surfaceAlt,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: up ? colors.success : colors.surface,
          }}
        >
          <Icon
            name={g.kind === 'down' ? 'arrowDown' : g.kind === 'up' ? 'arrowUp' : 'check'}
            size={20}
            color={up ? colors.bg : colors.text}
          />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="body" numeric style={{ fontWeight: '600', flexShrink: 1 }}>
              {title}
            </Text>
            <InfoButton topic="weightSuggestion" />
          </View>
          <Text variant="label" muted numeric>
            {reason}
          </Text>
          {dropLine ? (
            <Text variant="label" numeric>
              {`${t('session.suggest.drops')}: ${dropLine} ${unit}`}
            </Text>
          ) : null}
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
    </View>
  );
}
