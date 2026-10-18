import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MenuList, type MenuItem } from '@/components/ui/MenuList';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { formatInt } from '@/domain/numbers';
import { useGoalForDay } from '@/features/diet/log';
import { AppUpdateCard } from '@/features/settings/AppUpdateCard';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { getMode } from '@/lib/mode';
import { goBack } from '@/lib/navigation';
import { usePlanStore } from '@/lib/plan';
import { logOut, logOutAnyway } from './account';
import { useProfile } from './api';
import { useToday } from './use-today';

/**
 * Settings (the gear on your profile): every settings section, the plan, privacy, help and log
 * out. Your own page with your numbers is the profile (`/profile`).
 */
export function SettingsHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const plan = usePlanStore((s) => s.plan ?? 'free');
  const prefs = usePreferencesStore();
  const profile = useProfile();
  const goal = useGoalForDay(useToday());
  const [help, setHelp] = useState(false);
  const [unsynced, setUnsynced] = useState(false);

  const offline = getMode() === 'offline';
  const themeName = t(
    prefs.theme === 'dark'
      ? 'settings.themeDark'
      : prefs.theme === 'system'
        ? 'settings.themeSystem'
        : 'settings.themeLight',
  );
  // Grouped as in the canvas "Settings": account, plan, the app, your data.
  const groups: { title: string; items: MenuItem[] }[] = [
    {
      title: t('settings.group.account'),
      items: [
        {
          icon: 'user',
          label: t('profile.personalInfo'),
          value: profile.data?.name?.trim() || undefined,
          onPress: () => router.push('/profile-edit'),
        },
        {
          icon: 'flame',
          label: t('profile.links.goals'),
          value: goal ? t('profile.goalKcal', { kcal: formatInt(goal.kcal) }) : undefined,
          onPress: () => router.push('/diet-goals'),
        },
        ...(offline
          ? []
          : ([
              {
                icon: 'lock',
                label: t('profile.menu.password'),
                onPress: () => router.push('/profile/password'),
              },
            ] satisfies MenuItem[])),
      ],
    },
    {
      // Premium only (the AI plan). Supporter (community perks) is a separate plan, not built yet.
      title: t('settings.group.plans'),
      items: offline
        ? []
        : [
            {
              icon: 'trophy',
              label: t('premium.plansTitle'),
              help: t('settings.premiumHelp'),
              value: t(`profile.${plan}`),
              onPress: () => router.push('/profile/premium'),
            },
          ],
    },
    {
      title: t('settings.group.app'),
      items: [
        { icon: 'sparkle', label: t('profile.menu.ai'), onPress: () => router.push('/profile/ai') },
        // Canvas: units, look and reminders on one page (the single pages stay for old links).
        {
          icon: 'sliders',
          label: t('settings.preferences'),
          value: `${prefs.weightUnit} · ${themeName}`,
          onPress: () => router.push('/profile/preferences'),
        },
        {
          icon: 'eye',
          label: t('profile.menu.accessibility'),
          onPress: () => router.push('/profile/accessibility'),
        },
        { icon: 'info', label: t('profile.menu.help'), onPress: () => setHelp(true) },
      ],
    },
    {
      title: t('settings.group.data'),
      items: [
        {
          icon: 'shield',
          label: t('profile.menu.privacy'),
          onPress: () => router.push('/profile/privacy'),
        },
        ...(offline
          ? []
          : ([
              {
                icon: 'code',
                label: t('profile.menu.api'),
                help: t('settings.apiHelp'),
                onPress: () => router.push('/profile/api'),
              },
            ] satisfies MenuItem[])),
      ],
    },
  ];

  const doLogOut = async () => {
    const result = await logOut(queryClient);
    if (!result.ok) setUnsynced(true);
  };

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        <TopBar onBack={() => goBack(router, '/profile')} backLabel={t('common.back')} />
        <Text variant="screenTitle" accessibilityRole="header">
          {t('settings.title')}
        </Text>

        {offline ? (
          <Card gap={10}>
            <Text variant="titleM">{t('link.cardTitle')}</Text>
            <Button
              label={t('link.cardButton')}
              onPress={() => router.push('/profile/link-account')}
            />
          </Card>
        ) : null}

        {groups.map((g) => (
          <MenuList key={g.title} title={g.title} items={g.items} />
        ))}

        <AppUpdateCard />

        <Button
          variant="danger"
          label={offline ? t('profile.leaveOffline') : t('profile.logOut')}
          onPress={doLogOut}
        />
      </Screen>

      <Sheet
        visible={help}
        onClose={() => setHelp(false)}
        title={t('profile.help')}
        closeLabel={t('common.close')}
      >
        <Text muted>{t('profile.helpBody')}</Text>
        <Text variant="bodyS" muted>
          {t('profile.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
        </Text>
      </Sheet>

      <Sheet
        visible={unsynced}
        onClose={() => setUnsynced(false)}
        title={t('profile.unsyncedTitle')}
        closeLabel={t('common.close')}
        footer={
          <View style={{ gap: 8 }}>
            <Button size="large" label={t('profile.stay')} onPress={() => setUnsynced(false)} />
            <Button
              variant="danger"
              label={t('profile.logOutAnyway')}
              onPress={async () => {
                await logOutAnyway(queryClient);
                setUnsynced(false);
              }}
            />
          </View>
        }
      >
        <Text muted>{t('profile.unsyncedBody')}</Text>
      </Sheet>
    </>
  );
}
