import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardTitle } from '@/components/ui/CardTitle';
import { Gauge } from '@/components/ui/Gauge';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { Screen } from '@/components/ui/Screen';
import { StatusChip } from '@/components/ui/StatusChip';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useAppearanceStore } from '@/design/appearance-store';
import {
  areaHueOptions,
  areaUsingHue,
  canChooseAreaColors,
  colourAreas,
  effectiveAreaColors,
  pickAreaHue,
  resolveAreaColors,
  type ColourArea,
} from '@/design/area-colors';
import { readableOn } from '@/design/contrast';
import { areaFamilies, type AreaHue } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { goBack } from '@/lib/navigation';
import { usePlanStore } from '@/lib/plan';
import { useToastStore } from '@/lib/toast-store';

/** The tile of each area (as on the sign-in page and the cards). */
const AREA_ICON: Record<ColourArea, IconName> = {
  training: 'dumbbell',
  nutrition: 'bowl',
  streak: 'flame',
};

/** The current account can choose the area colours (Supporter / Premium, DECISIONS 118). */
export const useCanChooseAreaColors = () => canChooseAreaColors(usePlanStore((s) => s.plan));

/** The small "Supporter" tag of an option the plan does not include (as on the community board). */
export function SupporterTag() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        minHeight: 24,
        paddingHorizontal: 8,
        borderRadius: 12,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <Icon name="star" size={12} color={colors.textMuted} />
      <Text variant="label" semibold style={{ color: colors.textMuted }}>
        {t('community.supporterTag')}
      </Text>
    </View>
  );
}

/**
 * Settings > Units, look and reminders > Area colours (DECISIONS 118): a row of swatches per
 * area, a live preview and "Reset to default". Free accounts see it with the Supporter tag; a
 * swatch opens the Plans page.
 */
export function AreaColorsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const canChoose = useCanChooseAreaColors();
  const choice = useAppearanceStore((s) => s.areaColors);
  const setAppearance = useAppearanceStore((s) => s.set);
  const showToast = useToastStore((s) => s.show);
  const plan = usePlanStore((s) => s.plan);
  // What the app shows (defaults on Free) and what the swatches mark (the saved choice).
  const shown = effectiveAreaColors(choice, plan);
  const selected = canChoose ? shown : resolveAreaColors({});
  const changed = Object.keys(choice).length > 0;

  const pick = (area: ColourArea, hue: AreaHue) => {
    if (!canChoose) {
      router.push('/profile/premium');
      return;
    }
    const next = pickAreaHue(choice, area, hue);
    if (next) setAppearance('areaColors', next);
  };

  const reset = () => {
    const before = choice;
    setAppearance('areaColors', {});
    showToast({
      message: t('settings.areaColors.resetDone'),
      actionLabel: t('common.undo'),
      onAction: () => setAppearance('areaColors', before),
    });
  };

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={() => goBack(router, '/profile/preferences')} backLabel={t('common.back')} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text variant="screenTitle">{t('settings.areaColors.title')}</Text>
        {canChoose ? null : <SupporterTag />}
      </View>
      <Text muted>{t('settings.areaColors.intro')}</Text>

      {canChoose ? null : (
        <Card gap={10}>
          <Text>{t('settings.areaColors.supporterNote')}</Text>
          {changed ? <Text muted>{t('settings.areaColors.keptNote')}</Text> : null}
          <Button
            label={t('settings.areaColors.seePlans')}
            variant="secondary"
            icon="star"
            onPress={() => router.push('/profile/premium')}
          />
        </Card>
      )}

      {/* Live preview: what the app shows now (the defaults on Free). */}
      <Card gap={10}>
        <Text variant="body" semibold accessibilityRole="header">
          {t('settings.areaColors.preview')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {colourAreas.map((area) => (
            <IconTile key={area} icon={AREA_ICON[area]} area={area} size={40} />
          ))}
          <Gauge
            value={0.7}
            size={44}
            stroke={6}
            color={colors.training}
            track={colors.trainingSoft}
            accessibilityLabel={t('settings.areaColors.previewRing')}
          />
          <StatusChip label={t('settings.areaColors.previewChip')} area="nutrition" icon="check" />
          <StatusChip label={t('settings.areaColors.area.streak')} area="streak" icon="flame" />
        </View>
      </Card>

      {colourAreas.map((area) => (
        <Card key={area} gap={10}>
          <CardTitle
            icon={AREA_ICON[area]}
            area={area}
            title={t(`settings.areaColors.area.${area}`)}
            right={
              <Text variant="bodyS" muted>
                {t(`settings.areaColors.hue.${selected[area]}`)}
              </Text>
            }
          />
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t(`settings.areaColors.area.${area}`)}
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}
          >
            {areaHueOptions[area].map((hue) => (
              <Swatch
                key={hue}
                area={area}
                hue={hue}
                selected={selected[area] === hue}
                takenBy={canChoose ? areaUsingHue(selected, area, hue) : null}
                locked={!canChoose}
                onPress={() => pick(area, hue)}
              />
            ))}
          </View>
          {area === 'nutrition' ? (
            <Text variant="bodyS" muted>
              {t('settings.areaColors.pinkNote')}
            </Text>
          ) : null}
        </Card>
      ))}

      {canChoose ? (
        <Button
          label={t('settings.areaColors.reset')}
          variant="secondary"
          disabled={!changed}
          onPress={reset}
        />
      ) : null}
    </Screen>
  );
}

function Swatch({
  area,
  hue,
  selected,
  takenBy,
  locked,
  onPress,
}: {
  area: ColourArea;
  hue: AreaHue;
  selected: boolean;
  /** Another area shows this hue: it cannot be taken (two areas never share a colour). */
  takenBy: ColourArea | null;
  /** Free: the swatch opens the Plans page. */
  locked: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
  const highContrast = useAppearanceStore((s) => s.highContrast);
  const family = areaFamilies[hue][mode];
  const fill = (highContrast && family.mainHighContrast) || family.main;
  const color = t(`settings.areaColors.hue.${hue}`);
  const label = locked
    ? t('settings.areaColors.lockedA11y', { color })
    : takenBy
      ? t('settings.areaColors.takenA11y', {
          color,
          other: t(`settings.areaColors.area.${takenBy}`),
        })
      : color;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: takenBy != null }}
      aria-checked={selected}
      aria-disabled={takenBy != null}
      accessibilityLabel={label}
      accessibilityHint={t('settings.areaColors.swatchA11y', {
        color,
        area: t(`settings.areaColors.area.${area}`),
      })}
      disabled={takenBy != null}
      onPress={() => {
        tick();
        onPress();
      }}
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
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: fill,
          // Taken: faded, under the icon of the area that has it (never colour alone).
          opacity: takenBy ? 0.3 : 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <Icon name="check" size={16} color={readableOn(fill, '#FFFFFF', '#191917')} />
        ) : null}
      </View>
      {takenBy ? (
        <View style={{ position: 'absolute' }}>
          <Icon name={AREA_ICON[takenBy]} size={16} color={colors.text} />
        </View>
      ) : null}
    </Pressable>
  );
}
