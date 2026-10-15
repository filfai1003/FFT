import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { logOut } from '@/features/profile/account';
import { goBack } from '@/lib/navigation';
import { PLAN_PRICES_EUR, usePlanStore, type Plan } from '@/lib/plan';

/** What each plan adds to the one before (keys under premium.perks). */
const PLANS = [
  { plan: 'free', perks: ['everything', 'sync', 'web', 'safe', 'apiMcp', 'ownKey'] },
  { plan: 'premium', perks: ['freeAll', 'aiIncluded', 'aiCredit'] },
] as const satisfies readonly { plan: Plan; perks: readonly string[] }[];

/**
 * The plans and the one this account has. `gate`: the web app for an account without online data
 * (the only page it can reach; it can sign out). Otherwise the Profile page.
 */
export function PremiumScreen({ gate = false }: { gate?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const current = usePlanStore((s) => s.plan ?? 'free');

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      {gate ? null : (
        <TopBar onBack={() => goBack(router, '/profile')} backLabel={t('common.back')} />
      )}
      <View style={{ gap: 6 }}>
        <Text variant="screenTitle">{t('premium.plansTitle')}</Text>
        {gate ? <Text muted>{t('premium.gateIntro')}</Text> : null}
      </View>

      {PLANS.map(({ plan, perks }) => {
        const mine = plan === current;
        return (
          <View
            key={plan}
            accessibilityLabel={`${t(`premium.plan.${plan}`)}${mine ? `, ${t('premium.yourPlan')}` : ''}`}
            style={{
              gap: 12,
              padding: 16,
              borderRadius: 20,
              // The plan you have: the selection border of the design (2px, text colour).
              borderWidth: mine ? 2 : 1,
              borderColor: mine ? colors.borderSelected : colors.borderDecorative,
              backgroundColor: colors.surface,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text variant="titleM" style={{ flex: 1 }}>
                {t(`premium.plan.${plan}`)}
              </Text>
              <Text variant="titleM" numeric>
                {plan === 'free'
                  ? t('premium.priceFree')
                  : t('premium.pricePerMonth', { price: PLAN_PRICES_EUR[plan] })}
              </Text>
            </View>
            {mine ? (
              <Text variant="label" muted>
                {t('premium.yourPlan')}
              </Text>
            ) : null}
            {perks.map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Icon name="check" size={18} color={colors.text} />
                <Text variant="bodyS" style={{ flex: 1 }}>
                  {t(`premium.perks.${p}`)}
                </Text>
              </View>
            ))}
          </View>
        );
      })}

      <Text variant="bodyS" muted>
        {t('premium.howToGet')}
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
