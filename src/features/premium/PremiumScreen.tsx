import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { InfoButton } from '@/components/ui/InfoButton';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconTile, type Area } from '@/components/ui/IconTile';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { logOut } from '@/features/profile/account';
import { goBack } from '@/lib/navigation';
import { usePlanStore, type Plan } from '@/lib/plan';

/**
 * The three tiers, each adding to the one before (keys under premium.perks): Supporter adds the
 * community extras, Premium adds the AI coach on top of everything in Supporter. Only Free exists
 * today; the others say "Coming soon" (an account's plan is still free or premium, DECISIONS 100).
 */
const PLANS = [
  {
    tier: 'free',
    perks: ['everything', 'community', 'sync', 'web', 'safe', 'apiMcp', 'ownKey'],
  },
  { tier: 'supporter', perks: ['freeAll', 'filters', 'history', 'badge', 'cosmetics'] },
  { tier: 'premium', perks: ['supporterAll', 'aiIncluded', 'aiCredit'] },
] as const satisfies readonly { tier: Plan | 'supporter'; perks: readonly string[] }[];

/** Tile per tier (canvas "Plans"): Supporter is the community / badge tier, so streak orange. */
const LOOK = {
  free: { icon: 'check', area: 'neutral' },
  supporter: { icon: 'star', area: 'streak' },
  premium: { icon: 'sparkle', area: 'neutral' },
} as const satisfies Record<Plan | 'supporter', { icon: IconName; area: Area }>;

/** "Your plan": a small dark pill, as on the canvas (the 2px border says it too). */
function YourPlanPill({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        minHeight: 24,
        paddingHorizontal: 9,
        borderRadius: 12,
        backgroundColor: colors.text,
        justifyContent: 'center',
      }}
    >
      <Text variant="label" semibold style={{ color: colors.bg }}>
        {label}
      </Text>
    </View>
  );
}

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
        <TopBar onBack={() => goBack(router, '/profile/settings')} backLabel={t('common.back')} />
      )}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="screenTitle" style={{ flexShrink: 1 }}>
            {t('premium.plansTitle')}
          </Text>
          <InfoButton topic="plans" />
        </View>
        {gate ? <Text muted>{t('premium.gateIntro')}</Text> : null}
      </View>

      {PLANS.map(({ tier: plan, perks }) => {
        const mine = plan === current;
        return (
          <View
            key={plan}
            accessibilityLabel={`${t(`premium.plan.${plan}`)}${mine ? `, ${t('premium.yourPlan')}` : ''}`}
            style={{
              gap: 12,
              // The 2px border of your plan takes its pixel from the padding: nothing moves.
              padding: mine ? 15 : 16,
              borderRadius: 20,
              // The plan you have: the selection border of the design (2px, text colour).
              borderWidth: mine ? 2 : 1,
              borderColor: mine ? colors.borderSelected : colors.borderDecorative,
              backgroundColor: colors.surface,
            }}
          >
            {/* Canvas "Plans": a tile per tier, the name big, the price on the right. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile icon={LOOK[plan].icon} area={LOOK[plan].area} size={40} />
              <Text variant="displayS" semibold style={{ flex: 1 }}>
                {t(`premium.plan.${plan}`)}
              </Text>
              <Text variant="titleM" semibold numeric muted={plan !== 'free'}>
                {plan === 'free' ? t('premium.priceFree') : t('premium.comingSoon')}
              </Text>
            </View>
            {mine ? <YourPlanPill label={t('premium.yourPlan')} /> : null}
            {perks.map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                {/* A filled dot with a check: each perk reads as "included" at a glance. */}
                <View
                  aria-hidden
                  style={{
                    width: 20,
                    height: 20,
                    marginTop: 1,
                    borderRadius: 10,
                    backgroundColor: LOOK[plan].area === 'streak' ? colors.streak : colors.text,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="check" size={13} color={colors.surface} />
                </View>
                <Text variant="body" style={{ flex: 1 }}>
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
