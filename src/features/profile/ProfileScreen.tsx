import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { goBack } from '@/lib/navigation';
import { TopBar } from '@/components/ui/TopBar';
import { Sheet } from '@/components/ui/Sheet';
import { useToday } from '@/features/profile/use-today';
import { Text } from '@/components/ui/Text';
import { fontFamily } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { ageInYears } from '@/domain/nutrition';
import { cmToFeetInches, displayWeight } from '@/domain/units';
import { AppUpdateCard } from '@/features/settings/AppUpdateCard';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { getMode } from '@/lib/mode';
import { usePlanStore } from '@/lib/plan';
import { logOut, logOutAnyway } from './account';
import { useLatestWeight, useProfile } from './api';

/** Profile: who you are, premium showcase, and the settings sections. */
export function ProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const premium = usePlanStore((s) => s.premium === true && s.home === 'online');
  const weight = useLatestWeight();
  const today = useToday();
  const prefs = usePreferencesStore();
  const [help, setHelp] = useState(false);
  const [unsynced, setUnsynced] = useState(false);

  const p = profile.data;
  const name = p?.name?.trim() || t('profile.you');
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const age = p?.birth_date ? ageInYears(new Date(p.birth_date), new Date(today)) : null;
  const height =
    p?.height_cm == null
      ? null
      : prefs.lengthUnit === 'cm'
        ? `${Math.round(Number(p.height_cm))} CM`
        : (() => {
            const f = cmToFeetInches(Number(p.height_cm));
            return `${f.feet}′${f.inches}″`;
          })();
  const line = [
    age != null ? `${age} Y` : null,
    height,
    weight.data
      ? `${displayWeight(weight.data.weightKg, prefs.weightUnit)} ${prefs.weightUnit}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const since = p?.created_at
    ? new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(
        new Date(p.created_at),
      )
    : '';

  const offline = getMode() === 'offline';
  // Most used first: you and your units, then how the app talks to you and looks, the coach and
  // the plan; privacy and help at the end, on their own.
  const themeName = t(
    prefs.theme === 'dark'
      ? 'settings.themeDark'
      : prefs.theme === 'system'
        ? 'settings.themeSystem'
        : 'settings.themeLight',
  );
  const groups: { icon: IconName; name: string; value?: string; onPress: () => void }[][] = [
    [
      {
        icon: 'user',
        name: t('profile.menu.profile'),
        onPress: () => router.push('/profile-edit'),
      },
      {
        icon: 'scale',
        name: t('profile.menu.units'),
        value: `${prefs.weightUnit} · ${prefs.lengthUnit === 'cm' ? 'cm' : 'ft·in'}`,
        onPress: () => router.push('/profile/units'),
      },
      {
        icon: 'bell',
        name: t('profile.menu.notifications'),
        onPress: () => router.push('/profile/notifications'),
      },
      {
        icon: 'palette',
        name: t('profile.menu.look'),
        value: themeName,
        onPress: () => router.push('/profile/look'),
      },
      {
        icon: 'eye',
        name: t('profile.menu.accessibility'),
        onPress: () => router.push('/profile/accessibility'),
      },
    ],
    [
      { icon: 'sparkle', name: t('profile.menu.ai'), onPress: () => router.push('/profile/ai') },
      ...(offline
        ? []
        : [
            {
              icon: 'trophy' as IconName,
              name: t('profile.menu.premium'),
              onPress: () => router.push('/profile/premium'),
            },
          ]),
    ],
    [
      {
        icon: 'shield',
        name: t('profile.menu.privacy'),
        onPress: () => router.push('/profile/privacy'),
      },
      { icon: 'info', name: t('profile.menu.help'), onPress: () => setHelp(true) },
    ],
  ];

  const doLogOut = async () => {
    const result = await logOut(queryClient);
    if (!result.ok) setUnsynced(true);
  };

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        <TopBar onBack={() => goBack(router, '/')} backLabel={t('common.close')} backIcon="close" />
        <View style={{ gap: 4 }}>
          <Text variant="label" muted>
            {t('profile.memberSince', { date: since })}
          </Text>
          <Text variant="screenTitle">{t('nav.profile')}</Text>
          <Text variant="label" muted>
            {offline
              ? t('profile.offlineBadge')
              : premium
                ? t('profile.premiumBadge')
                : t('profile.localBadge')}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}. ${t('profile.personalInfo')}`}
          onPress={() => router.push('/profile-edit')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 14,
            paddingLeft: 16,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.borderDecorative,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.dotOff,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ fontFamily: fontFamily.bodySemiBold, fontSize: 20 }}
              accessibilityElementsHidden
            >
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="bodyL" medium numberOfLines={1} style={{ flexShrink: 1 }}>
                {name}
              </Text>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.borderControl,
                }}
              >
                <Text variant="label">{premium ? t('profile.premium') : t('profile.free')}</Text>
              </View>
            </View>
            <Text variant="label" muted>
              {line}
            </Text>
          </View>
        </Pressable>

        {offline ? (
          <Card gap={10}>
            <Text variant="titleM">{t('link.cardTitle')}</Text>
            <Text variant="bodyS" muted>
              {t('link.cardBody')}
            </Text>
            <Button
              label={t('link.cardButton')}
              onPress={() => router.push('/profile/link-account')}
            />
          </Card>
        ) : null}

        {groups.map((rows, i) => (
          <View
            key={i}
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.borderDecorative,
              backgroundColor: colors.surface,
              paddingLeft: 16,
              paddingRight: 14,
            }}
          >
            {rows.map((r, j) => (
              <Pressable
                key={r.name}
                accessibilityRole="button"
                accessibilityLabel={r.value ? `${r.name}, ${r.value}` : r.name}
                onPress={r.onPress}
                style={({ pressed }) => ({
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderTopWidth: j === 0 ? 0 : 1,
                  borderColor: colors.divider,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Icon name={r.icon} size={20} color={colors.text} />
                <Text style={{ flex: 1 }}>{r.name}</Text>
                {r.value ? (
                  <Text variant="bodyS" muted>
                    {r.value}
                  </Text>
                ) : null}
                <Icon name="chevronRight" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={offline ? t('profile.leaveOffline') : t('profile.logOut')}
          onPress={doLogOut}
          style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="label" muted>
            {offline ? t('profile.leaveOffline') : t('profile.logOut')}
          </Text>
        </Pressable>
      </Screen>

      <Sheet
        visible={help}
        onClose={() => setHelp(false)}
        title={t('profile.help')}
        closeLabel={t('common.close')}
      >
        <Text muted>{t('profile.helpBody')}</Text>
        <Text variant="label" muted>
          {t('profile.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
        </Text>
        <AppUpdateCard />
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
