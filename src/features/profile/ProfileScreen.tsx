import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { useToday } from '@/features/profile/use-today';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { fontFamily } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { ageInYears } from '@/domain/nutrition';
import { cmToFeetInches, displayWeight } from '@/domain/units';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { getMode } from '@/lib/mode';
import { logOut, logOutAnyway } from './account';
import { useLatestWeight, useProfile } from './api';

/** Profile: who you are, premium showcase, and the settings sections. */
export function ProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const barHeight = useTabBarHeight();
  const profile = useProfile();
  const weight = useLatestWeight();
  const today = useToday();
  const prefs = usePreferencesStore();
  const [premium, setPremium] = useState(false);
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
      ? `${displayWeight(weight.data.weightKg, prefs.weightUnit)} ${prefs.weightUnit.toUpperCase()}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const since = p?.created_at
    ? new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' })
        .format(new Date(p.created_at))
        .toUpperCase()
    : '';

  const groups: { name: string; value?: string; onPress: () => void }[][] = [
    [
      {
        name: t('profile.settings'),
        value: `${prefs.weightUnit.toUpperCase()} · ${prefs.lengthUnit === 'cm' ? 'CM' : 'FT·IN'}`,
        onPress: () => router.push('/profile/settings'),
      },
      { name: t('profile.accessibility'), onPress: () => router.push('/profile/accessibility') },
    ],
    [
      { name: t('profile.ai'), onPress: () => router.push('/profile/ai') },
      { name: t('profile.privacy'), onPress: () => router.push('/profile/privacy') },
      { name: t('profile.help'), onPress: () => setHelp(true) },
    ],
  ];

  const offline = getMode() === 'offline';

  const doLogOut = async () => {
    const result = await logOut(queryClient);
    if (!result.ok) setUnsynced(true);
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <View style={{ gap: 4 }}>
          <Text variant="label" muted>
            {t('profile.memberSince', { date: since })}
          </Text>
          <Text variant="screenTitle">{t('nav.profile')}</Text>
          <Text variant="label" muted>
            {offline ? t('profile.offlineBadge') : t('profile.localBadge')}
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
              borderWidth: 1,
              borderColor: colors.borderControl,
              backgroundColor: colors.surfaceSelected,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ fontFamily: fontFamily.display, fontSize: 22 }}
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
                <Text variant="label" style={{ letterSpacing: 1 }}>
                  {t('profile.free')}
                </Text>
              </View>
            </View>
            <Text variant="label" muted>
              {line}
            </Text>
          </View>
        </Pressable>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: 14,
            paddingLeft: 16,
            borderRadius: 22,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.borderControl,
            backgroundColor: colors.surfaceAlt,
          }}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="label" muted>
              {t('profile.premium')}
            </Text>
            <Text variant="bodyS">{t('profile.premiumLine')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.seePlans')}
            onPress={() => setPremium(true)}
            style={({ pressed }) => ({
              height: 44,
              paddingHorizontal: 14,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.borderSelected,
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="label">{t('profile.seePlans')}</Text>
          </Pressable>
        </View>

        {groups.map((rows, i) => (
          <View
            key={i}
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.borderDecorative,
              backgroundColor: colors.surfaceAlt,
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
                  borderStyle: 'dashed',
                  borderColor: colors.borderDecorative,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ flex: 1 }}>{r.name}</Text>
                {r.value ? (
                  <Text variant="label" muted>
                    {r.value}
                  </Text>
                ) : null}
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
        visible={premium}
        onClose={() => setPremium(false)}
        title={t('profile.premium')}
        closeLabel={t('common.close')}
      >
        <Text muted>{t('profile.premiumBody')}</Text>
        {(['widgets', 'sync', 'ai', 'coach'] as const).map((k) => (
          <View key={k} style={{ minHeight: 52, justifyContent: 'center', opacity: 0.5 }}>
            <Text>{t(`profile.premiumItem.${k}`)}</Text>
            <Text variant="label" muted>
              {t('profile.comingSoon')}
            </Text>
          </View>
        ))}
        <Text variant="bodyS" muted>
          {t('profile.premiumFree')}
        </Text>
      </Sheet>

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
