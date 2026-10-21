import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import type { Translate } from '@/i18n';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useWeeklySummary } from './data';
import { weeklyLine } from './text';

/**
 * Progress · Me: "This week" in one line, opening the weekly summary (DECISIONS 122), so the
 * summary is there without the Sunday notification.
 */
export function ThisWeekCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const { summary, dietTracked } = useWeeklySummary();
  if (!summary) return null;
  const line = weeklyLine(summary, t as unknown as Translate, unit, dietTracked);

  return (
    <Card
      onPress={() => router.push(`/progress/week?from=${summary.from}`)}
      accessibilityLabel={t('weekly.cardA11y', { summary: line })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile icon="calendar" area="neutral" size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyS" semibold>
            {t('weekly.card')}
          </Text>
          <Text variant="bodyS" muted numeric>
            {line}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={colors.textPlaceholderIcon} />
      </View>
    </Card>
  );
}
