import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { IconButton } from './IconButton';
import { Text } from './Text';

/**
 * The header of the four tab pages (DECISIONS 123): optional leading avatar, a small line over
 * the title (the date, the last workout), the title, then the page's round buttons on the right.
 * Pages with days end the row with the calendar button, always the same icon in the same place
 * (the right end), which opens the shared calendar sheet. The page's main action is never here
 * (it sits in the page, or in the bottom bar of pushed pages).
 */
export function PageHeader({
  title,
  titleNode,
  overline,
  leading,
  actions,
  onCalendar,
}: {
  title?: string;
  /** In place of the plain title (Today's greeting); it must carry the header role itself. */
  titleNode?: ReactNode;
  overline?: string;
  leading?: ReactNode;
  actions?: ReactNode;
  /** Shows the calendar button at the right end. */
  onCalendar?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
      {leading}
      <View style={{ flex: 1, gap: 2, marginLeft: leading ? 2 : 0 }}>
        {overline ? (
          <Text variant="bodyS" muted numeric>
            {overline}
          </Text>
        ) : null}
        {titleNode ?? (
          <Text variant="screenTitle" accessibilityRole="header">
            {title}
          </Text>
        )}
      </View>
      {actions}
      {onCalendar ? (
        <IconButton
          icon="calendar"
          accessibilityLabel={t('days.openCalendar')}
          onPress={onCalendar}
        />
      ) : null}
    </View>
  );
}
