import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { CardTitle } from '@/components/ui/CardTitle';
import type { IconName } from '@/components/ui/Icon';
import type { Area } from '@/components/ui/IconTile';
import { Screen } from '@/components/ui/Screen';
import { StatusChip } from '@/components/ui/StatusChip';
import { Text } from '@/components/ui/Text';
import { ToggleRow } from '@/components/ui/ToggleRow';
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

  const sections: { title: string; icon: IconName; area?: Area; rows: Row[]; size?: boolean }[] = [
    {
      title: t('a11y.text'),
      icon: 'book',
      size: true,
      rows: [{ key: 'boldText', name: 'boldText' }],
    },
    {
      title: t('a11y.vision'),
      icon: 'eye',
      rows: [
        { key: 'highContrast', name: 'highContrast' },
        { key: 'reduceMotion', name: 'reduceMotion' },
        { key: 'haptics', name: 'haptics' },
      ],
    },
    {
      title: t('a11y.workouts'),
      icon: 'dumbbell',
      area: 'training',
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
      <TopBar onBack={() => goBack(router, '/profile/settings')} backLabel={t('common.back')} />
      <Text variant="screenTitle">{t('a11y.title')}</Text>

      <Card gap={6}>
        <StatusChip label={t('a11y.preview')} />
        <Text variant="body" medium>
          {t('today.caloriesLeft')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="displayL" numeric>
            {1360}
          </Text>
          <Text variant="bodyS" muted>
            {t('common.kcal')}
          </Text>
        </View>
      </Card>

      {sections.map((s) => (
        <Card key={s.title} gap={0}>
          <CardTitle icon={s.icon} area={s.area} title={s.title} />
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
                        // Short pills (canvas): the steps read as a bar that fills to the size.
                        width: 14,
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
            <ToggleRow
              key={r.key}
              name={t(`a11y.option.${r.name}.name`)}
              detail={t(`a11y.option.${r.name}.detail`)}
              value={a[r.key] as boolean}
              onValueChange={(v) => a.set(r.key as 'boldText', v)}
              divider={s.size || r !== s.rows[0]}
            />
          ))}
        </Card>
      ))}
    </Screen>
  );
}
