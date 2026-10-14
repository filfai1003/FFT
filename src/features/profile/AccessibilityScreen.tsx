import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { TopBar } from '@/components/ui/TopBar';
import { useAppearanceStore, type AppearanceState } from '@/design/appearance-store';
import { textScaleSteps } from '@/design/theme';
import { useTheme } from '@/design/use-theme';
import { goBack } from '@/lib/navigation';

type OptionName =
  | 'boldText'
  | 'dotNumbers'
  | 'highContrast'
  | 'reduceMotion'
  | 'haptics'
  | 'oneHandMode'
  | 'spokenCountdown';
type Row = { key: keyof AppearanceState; name: OptionName };

/** Accessibility: text size and display / motion / workout options, applied app-wide at once. */
export function AccessibilityScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const a = useAppearanceStore();

  const sections: { title: string; rows: Row[]; size?: boolean }[] = [
    {
      title: t('a11y.text'),
      size: true,
      rows: [{ key: 'boldText', name: 'boldText' }],
    },
    {
      title: t('a11y.vision'),
      rows: [
        { key: 'highContrast', name: 'highContrast' },
        { key: 'reduceMotion', name: 'reduceMotion' },
        { key: 'haptics', name: 'haptics' },
      ],
    },
    {
      title: t('a11y.workouts'),
      rows: [
        { key: 'oneHandMode', name: 'oneHandMode' },
        { key: 'spokenCountdown', name: 'spokenCountdown' },
      ],
    },
  ];

  const step = (delta: number) =>
    a.set('textScaleStep', Math.min(5, Math.max(1, a.textScaleStep + delta)));

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={() => goBack(router, '/profile')} backLabel={t('common.back')} />
      <Text variant="screenTitle">{t('a11y.title')}</Text>

      <Card gap={6}>
        <Text variant="label" muted>
          {t('a11y.preview')}
        </Text>
        <Text variant="bodyS">{t('today.caloriesLeft')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="displayL" numeric>
            {1360}
          </Text>
          <Text variant="label" muted>
            {t('common.kcal')}
          </Text>
        </View>
      </Card>

      {sections.map((s) => (
        <Card key={s.title} gap={0}>
          <Text variant="label" muted accessibilityRole="header" style={{ paddingBottom: 6 }}>
            {s.title}
          </Text>
          {s.size ? (
            <View
              style={{
                minHeight: 60,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <Text>{t('a11y.textSize')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.smaller')}
                  disabled={a.textScaleStep <= 1}
                  aria-disabled={a.textScaleStep <= 1}
                  onPress={() => step(-1)}
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: a.textScaleStep <= 1 ? 0.35 : 1,
                  }}
                >
                  <Text variant="bodyS">{'A'}</Text>
                </Pressable>
                <View
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel={t('a11y.sizeOf', { n: a.textScaleStep })}
                  style={{ flexDirection: 'row', gap: 5 }}
                >
                  {textScaleSteps.map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: i < a.textScaleStep ? colors.dotOn : colors.dotOff,
                      }}
                    />
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.larger')}
                  disabled={a.textScaleStep >= 5}
                  aria-disabled={a.textScaleStep >= 5}
                  onPress={() => step(1)}
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: a.textScaleStep >= 5 ? 0.35 : 1,
                  }}
                >
                  <Text variant="titleM">{'A'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {s.rows.map((r) => (
            <View
              key={r.key}
              style={{
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderTopWidth: s.size || r !== s.rows[0] ? 1 : 0,
                borderColor: colors.borderDecorative,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text>{t(`a11y.option.${r.name}.name`)}</Text>
                <Text variant="label" muted>
                  {t(`a11y.option.${r.name}.detail`)}
                </Text>
              </View>
              <Toggle
                value={a[r.key] as boolean}
                onValueChange={(v) => a.set(r.key as 'boldText', v)}
                accessibilityLabel={t(`a11y.option.${r.name}.name`)}
              />
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
