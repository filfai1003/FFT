import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';

type Props = {
  direction: 'up' | 'down';
  failed?: boolean;
  onRetry?: () => void;
  /** Only when going up: keep working on the phone, the move is tried again next time. */
  onLater?: () => void;
};

/** Shown while an account's data moves between the phone and the server (plan changed). */
export function PlanMoveScreen({ direction, failed = false, onRetry, onLater }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const up = direction === 'up';
  return (
    <Screen gap={16}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        {failed ? null : (
          <ActivityIndicator color={colors.text} accessibilityLabel={t('premium.moving')} />
        )}
        <Text variant="screenTitle" accessibilityRole="header">
          {failed
            ? t('premium.moveFailedTitle')
            : up
              ? t('premium.upTitle')
              : t('premium.downTitle')}
        </Text>
        <Text muted>
          {failed ? t('premium.moveFailedBody') : up ? t('premium.upBody') : t('premium.downBody')}
        </Text>
      </View>
      {failed ? (
        <View style={{ gap: 8 }}>
          <Button size="large" label={t('common.retry')} onPress={() => onRetry?.()} />
          {up && onLater ? (
            <Button variant="secondary" label={t('premium.later')} onPress={onLater} />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
