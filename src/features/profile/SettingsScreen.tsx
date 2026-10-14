import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { TopBar } from '@/components/ui/TopBar';
import { useAppearanceStore } from '@/design/appearance-store';
import { readableOn } from '@/design/contrast';
import { accentColor } from '@/design/theme';
import { accentOptions, type AccentName } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { ensurePermission } from '@/lib/notifications';
import { goBack } from '@/lib/navigation';
import { ReminderRow } from '@/features/settings/ReminderRow';
import { usePreferencesStore } from '@/features/settings/preferences-store';

/** One settings page (from Profile): back, title, content. */
function SettingsPage({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={() => goBack(router, '/profile')} backLabel={t('common.back')} />
      <Text variant="screenTitle">{title}</Text>
      {children}
    </Screen>
  );
}

/** Units: weight, length, energy, first day of the week. */
export function UnitsScreen() {
  const { t } = useTranslation();
  const prefs = usePreferencesStore();
  return (
    <SettingsPage title={t('settings.units')}>
      <Card gap={0}>
        <UnitRow label={t('settings.weight')} first>
          <Segmented
            accessibilityLabel={t('settings.weight')}
            value={prefs.weightUnit}
            onChange={(v) => prefs.set('weightUnit', v)}
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
          />
        </UnitRow>
        <UnitRow label={t('settings.length')}>
          <Segmented
            accessibilityLabel={t('settings.length')}
            value={prefs.lengthUnit}
            onChange={(v) => prefs.set('lengthUnit', v)}
            options={[
              { value: 'cm', label: 'cm' },
              { value: 'ft_in', label: 'ft·in' },
            ]}
          />
        </UnitRow>
        <UnitRow label={t('settings.energy')}>
          <Segmented
            accessibilityLabel={t('settings.energy')}
            value={prefs.energyUnit}
            onChange={(v) => prefs.set('energyUnit', v)}
            options={[
              { value: 'kcal', label: 'kcal' },
              { value: 'kj', label: 'kJ' },
            ]}
          />
        </UnitRow>
        <UnitRow label={t('settings.weekStarts')} last>
          <Segmented
            accessibilityLabel={t('settings.weekStarts')}
            value={prefs.weekStart}
            onChange={(v) => prefs.set('weekStart', v)}
            options={[
              { value: 'mon', label: t('settings.mon') },
              { value: 'sun', label: t('settings.sun') },
            ]}
          />
        </UnitRow>
      </Card>
    </SettingsPage>
  );
}

/** Look: accent colour, app theme and workout theme. */
export function LookScreen() {
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
  const prefs = usePreferencesStore();
  const accent = useAppearanceStore((s) => s.accent);
  const setAppearance = useAppearanceStore((s) => s.set);
  const themeOptions = [
    { value: 'light' as const, label: t('settings.themeLight') },
    { value: 'dark' as const, label: t('settings.themeDark') },
    { value: 'system' as const, label: t('settings.themeSystem') },
  ];
  return (
    <SettingsPage title={t('settings.look')}>
      <Card gap={14}>
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
                      backgroundColor: accentColor(name, mode),
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected ? (
                      <Icon
                        name="check"
                        size={16}
                        color={readableOn(accentColor(name, mode), '#FFFFFF', '#191917')}
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
            value={prefs.theme}
            onChange={(v) => prefs.set('theme', v)}
            options={themeOptions}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text>{t('settings.workoutTheme')}</Text>
          <Segmented
            accessibilityLabel={t('settings.workoutTheme')}
            value={prefs.workoutTheme}
            onChange={(v) => prefs.set('workoutTheme', v)}
            options={themeOptions}
          />
        </View>
      </Card>
    </SettingsPage>
  );
}

/** Notifications: the rest timer and every reminder (the only place they are set). */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const prefs = usePreferencesStore();
  const [denied, setDenied] = useState(false);

  const toggleRestTimer = async (value: boolean) => {
    // Switching it on asks the system first; without its permission nothing can be on.
    if (value && !(await ensurePermission())) {
      setDenied(true);
      return;
    }
    prefs.set('notifications', { ...prefs.notifications, rest_timer: value });
  };

  return (
    <SettingsPage title={t('settings.notifications')}>
      <Card gap={0}>
        <View
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyS" medium>
              {t('settings.notification.rest_timer.name')}
            </Text>
            <Text variant="label" muted>
              {prefs.notifications.rest_timer
                ? t('settings.notification.rest_timer.detail')
                : t('settings.off')}
            </Text>
          </View>
          <Toggle
            value={prefs.notifications.rest_timer}
            onValueChange={(v) => void toggleRestTimer(v)}
            accessibilityLabel={t('settings.notification.rest_timer.name')}
          />
        </View>
        {(['workout', 'checkin', 'meals'] as const).map((kind) => (
          <View
            key={kind}
            style={{
              borderTopWidth: 1,
              borderColor: colors.borderDecorative,
            }}
          >
            <ReminderRow kind={kind} bare />
          </View>
        ))}
      </Card>

      <Sheet
        visible={denied}
        onClose={() => setDenied(false)}
        title={t('settings.deniedTitle')}
        closeLabel={t('common.close')}
      >
        <Text muted>{t('settings.deniedBody')}</Text>
        <Button
          label={t('settings.openDeviceSettings')}
          onPress={() => {
            setDenied(false);
            void Linking.openSettings();
          }}
        />
      </Sheet>
    </SettingsPage>
  );
}

function UnitRow({
  label,
  children,
  last,
  first,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
  first?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        gap: 8,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : 1,
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
