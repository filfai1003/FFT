import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { logOut } from '@/features/profile/account';
import { goBack } from '@/lib/navigation';
import { usePlanStore } from '@/lib/plan';

const PERKS = ['premium.perkWeb', 'premium.perkDevices', 'premium.perkSafe'] as const;

/**
 * What premium is and whether this account has it. `gate`: the web app for an account without
 * premium (the only page it can reach; it can sign out). Otherwise the Profile page.
 */
export function PremiumScreen({ gate = false }: { gate?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const premium = usePlanStore((s) => s.premium === true);

  return (
    <Screen scroll bottomBarHeight={24} gap={16}>
      {gate ? null : (
        <TopBar onBack={() => goBack(router, '/profile')} backLabel={t('common.back')} />
      )}
      <View style={{ gap: 6 }}>
        <Text variant="screenTitle">{t('premium.title')}</Text>
        <Text muted>{gate ? t('premium.gateIntro') : t('premium.intro')}</Text>
      </View>

      <Card gap={14}>
        {PERKS.map((key) => (
          <View key={key} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Icon name="check" size={20} color={colors.text} />
            <Text style={{ flex: 1 }}>{t(key)}</Text>
          </View>
        ))}
      </Card>

      <Card gap={8}>
        <Text variant="titleM">{premium ? t('premium.activeTitle') : t('premium.soonTitle')}</Text>
        <Text variant="bodyS" muted>
          {premium ? t('premium.activeBody') : t('premium.soonBody')}
        </Text>
      </Card>

      <Text variant="bodyS" muted>
        {t('premium.freeNote')}
      </Text>

      {gate ? (
        <Button
          variant="secondary"
          label={t('profile.logOut')}
          onPress={() => void logOut(queryClient)}
        />
      ) : null}
    </Screen>
  );
}
