import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';

/** The date above the Diet title: tap it to jump to another day. */
export function PickDayLabel({ label, onPress }: { label: string; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${t('diet.openCalendar')}`}
      onPress={onPress}
      hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Text variant="label" muted>
        {label}
      </Text>
      <Icon name="chevronDown" size={14} color={colors.textMuted} />
    </Pressable>
  );
}
