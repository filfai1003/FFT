import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { OptionCard } from '@/components/ui/OptionCard';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { TopBar } from '@/components/ui/TopBar';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { useAppearanceStore } from '@/design/appearance-store';
import { accentOptions, type AccentName } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { setReminder } from '@/lib/notifications';
import { goBack } from '@/lib/navigation';
import { usePreferencesStore, type NotificationPrefs } from '@/features/settings/preferences-store';

type NotifKey = keyof NotificationPrefs;
const notifications: { key: NotifKey; reminder?: 'workout' | 'checkin' | 'meals' }[] = [
  { key: 'rest_timer' },
  { key: 'workout_reminder', reminder: 'workout' },
  { key: 'weekly_check_in', reminder: 'checkin' },
  { key: 'meals', reminder: 'meals' },
];

/** Settings: units, accent colour, theme, language and notifications. */
export function SettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const prefs = usePreferencesStore();
  const accent = useAppearanceStore((s) => s.accent);
  const setAppearance = useAppearanceStore((s) => s.set);
  const [language, setLanguage] = useState(false);
  const [denied, setDenied] = useState(false);

  const toggleNotification = async (
    key: NotifKey,
    reminder: 'workout' | 'checkin' | 'meals' | undefined,
    value: boolean,
  ) => {
    if (reminder) {
      const ok = await setReminder(reminder, value, {
        title: t(`settings.reminder.${reminder}.title`),
        body: t(`settings.reminder.${reminder}.body`),
      });
      if (!ok && value) {
        setDenied(true);
        return;
      }
    }
    prefs.set('notifications', { ...prefs.notifications, [key]: value });
  };

  return (
    <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
      <TopBar onBack={() => goBack(router, '/profile')} backLabel={t('common.back')} />
      <Text variant="screenTitle">{t('settings.title')}</Text>

      <Card gap={0}>
        <Text variant="label" muted style={{ paddingBottom: 8 }}>
          {t('settings.units')}
        </Text>
        <UnitRow label={t('settings.weight')}>
          <Segmented
            accessibilityLabel={t('settings.weight')}
            value={prefs.weightUnit}
            onChange={(v) => prefs.set('weightUnit', v)}
            options={[
              { value: 'kg', label: 'KG' },
              { value: 'lb', label: 'LB' },
            ]}
          />
        </UnitRow>
        <UnitRow label={t('settings.length')}>
          <Segmented
            accessibilityLabel={t('settings.length')}
            value={prefs.lengthUnit}
            onChange={(v) => prefs.set('lengthUnit', v)}
            options={[
              { value: 'cm', label: 'CM' },
              { value: 'ft_in', label: 'FT·IN' },
            ]}
          />
        </UnitRow>
        <UnitRow label={t('settings.energy')}>
          <Segmented
            accessibilityLabel={t('settings.energy')}
            value={prefs.energyUnit}
            onChange={(v) => prefs.set('energyUnit', v)}
            options={[
              { value: 'kcal', label: 'KCAL' },
              { value: 'kj', label: 'KJ' },
            ]}
          />
        </UnitRow>
        <UnitRow label={t('settings.weekStarts')} last>
          <Segmented
            accessibilityLabel={t('settings.weekStarts')}
            value={prefs.weekStart}
            onChange={(v) => prefs.set('weekStart', v)}
            options={[
              { value: 'mon', label: 'MON' },
              { value: 'sun', label: 'SUN' },
            ]}
          />
        </UnitRow>
      </Card>

      <Card gap={14}>
        <Text variant="label" muted>
          {t('settings.appearance')}
        </Text>
        <View style={{ gap: 10 }}>
          <Text>{t('settings.accent')}</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('settings.accent')}
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}
          >
            {(Object.keys(accentOptions) as AccentName[]).map((name) => {
              const selected = accent === name;
              return (
                <Pressable
                  key={name}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  accessibilityLabel={t(`settings.color.${name}`)}
                  onPress={() => setAppearance('accent', name)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? colors.borderSelected : colors.borderControl,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: accentOptions[name],
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected ? (
                      <Icon
                        name="check"
                        size={16}
                        color={
                          name === 'white' || name === 'yellow' || name === 'green'
                            ? '#000000'
                            : '#FFFFFF'
                        }
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text>{t('settings.theme')}</Text>
          <Segmented
            accessibilityLabel={t('settings.theme')}
            value="dark"
            onChange={() => undefined}
            options={[
              { value: 'dark', label: t('settings.dark') },
              { value: 'light', label: t('settings.light'), disabled: true },
              { value: 'system', label: t('settings.system'), disabled: true },
            ]}
          />
          <Text variant="bodyS" muted>
            {t('settings.themeNote')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('settings.language')}, ${t('settings.english')}`}
          onPress={() => setLanguage(true)}
          style={{
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text>{t('settings.language')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="label" muted>
              {t('settings.english')}
            </Text>
            <Icon name="chevronRight" size={16} color={colors.textMuted} />
          </View>
        </Pressable>
      </Card>

      <Card gap={0}>
        <Text variant="label" muted style={{ paddingBottom: 4 }}>
          {t('settings.notifications')}
        </Text>
        {notifications.map((n, i) => (
          <View
            key={n.key}
            style={{
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderTopWidth: i === 0 ? 0 : 1,
              borderStyle: 'dashed',
              borderColor: colors.borderDecorative,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text>{t(`settings.notification.${n.key}.name`)}</Text>
              <Text variant="label" muted>
                {prefs.notifications[n.key]
                  ? t(`settings.notification.${n.key}.detail`)
                  : t('settings.off')}
              </Text>
            </View>
            <Toggle
              value={prefs.notifications[n.key]}
              onValueChange={(v) => void toggleNotification(n.key, n.reminder, v)}
              accessibilityLabel={t(`settings.notification.${n.key}.name`)}
            />
          </View>
        ))}
      </Card>

      <Sheet
        visible={language}
        onClose={() => setLanguage(false)}
        title={t('settings.language')}
        closeLabel={t('common.close')}
      >
        <OptionCard title={t('settings.english')} selected onPress={() => setLanguage(false)} />
        <Text variant="bodyS" muted>
          {t('settings.moreLanguages')}
        </Text>
      </Sheet>

      <Sheet
        visible={denied}
        onClose={() => setDenied(false)}
        title={t('settings.deniedTitle')}
        closeLabel={t('common.close')}
      >
        <Text muted>{t('settings.deniedBody')}</Text>
      </Sheet>
    </Screen>
  );
}

function UnitRow({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        gap: 8,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.borderDecorative,
        borderBottomWidth: 0,
        marginBottom: last ? -4 : 0,
      }}
    >
      <Text variant="bodyS" muted>
        {label}
      </Text>
      {children}
    </View>
  );
}
