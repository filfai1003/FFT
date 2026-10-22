import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { AnimatedPressable, pressFeedback, usePressScale } from '@/components/ui/motion';
import { Segmented } from '@/components/ui/Segmented';
import { StatusChip } from '@/components/ui/StatusChip';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { compactDateLabel, shortDateLabel } from '@/domain/day';
import { displayWeight } from '@/domain/units';
import { useProfile } from '@/features/profile/api';
import { useBodyEntries, useBodyGoal } from '@/features/progress/data';
import { PeriodLine, useChangeWords } from '@/features/progress/PeriodLine';
import { changeArea } from '@/features/progress/series';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { HOME_BODY_WEEKS, hasBodyFat, homeBodySeries, type BodyView } from './body-card';
import { useBodyViewStore } from './body-view-store';
import { BigNumber, Frame } from './CardFrame';
import { useHomeDay } from './home-day';
import type { WidgetSize } from './layout-store';

/** Under this change (kg or points) the value held steady: no arrow, "Steady". */
const STEADY = 0.05;

/** One decimal, without a trailing ".0" for a goal ("Goal 75 kg", "Goal 15.5 %"). */
const short = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Home weight card (DECISIONS 128): the latest weight in the user's unit, the weekly line of the
 * last six weeks as on Progress (green / red toward the goal, `changeArea`), the change with
 * arrow and words and the goal. Once body fat has been logged, a switch shows its own line
 * instead (remembered on this device). Opens the Body page.
 */
export function WeightWidget({ size }: { size: WidgetSize }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const words = useChangeWords();
  // The day Home shows: today, or a past day picked on the row of days (DECISIONS 123).
  const { day, past } = useHomeDay();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const profileGoal = useProfile().data?.goal;
  const bodyGoal = useBodyGoal().data;
  const entries = useBodyEntries().data ?? [];
  const chosen = useBodyViewStore((s) => s.view);
  const setView = useBodyViewStore((s) => s.setView);
  const press = usePressScale(pressFeedback.surface);

  // The switch only once body fat has been logged (by the shown day); else the weight.
  const fatLogged = hasBodyFat(entries, day);
  const view: BodyView = fatLogged ? chosen : 'weight';
  const isWeight = view === 'weight';
  const series = homeBodySeries(entries, view, day);
  const small = size === 'small';

  const target = isWeight
    ? (bodyGoal?.targetWeightKg ?? null)
    : (bodyGoal?.targetBodyFatPct ?? null);
  // Green closer to the goal, red further away; without a goal the profile goal (weight) or
  // smaller is better (body fat), as on Progress (DECISIONS 114).
  const area = changeArea(series.delta, isWeight ? profileGoal : 'smallerIsBetter', STEADY, {
    latest: series.latest,
    target,
  });
  const shown = (v: number) => (isWeight ? displayWeight(v, unit) : v);
  const unitLabel = isWeight ? unit : '%';
  const value = series.latest != null ? shown(series.latest).toFixed(1) : null;
  const title = isWeight ? t('today.weight') : t('progress.tabFat');

  const moved = series.delta != null && Math.abs(series.delta) >= STEADY;
  const amount =
    series.delta == null
      ? ''
      : isWeight
        ? `${shown(Math.abs(series.delta)).toFixed(1)} ${unit}`
        : t('progress.pts', { delta: Math.abs(series.delta).toFixed(1) });
  const goalText =
    target != null ? t('progress.goal', { value: short(shown(target)), unit: unitLabel }) : null;

  // What a screen reader hears for the whole card: the value, the change in words, the goal.
  const summary = [
    title,
    value != null ? `${value} ${unitLabel}` : t('progress.noneYet'),
    series.delta == null
      ? null
      : moved
        ? t('today.weightCard.changeA11y', {
            change: words(series.delta, amount),
            weeks: HOME_BODY_WEEKS,
          })
        : t('progress.steady'),
    goalText,
  ]
    .filter(Boolean)
    .join(', ');

  // The check-in logs today: a past day without a value has nothing to open.
  const open =
    series.latest != null
      ? () => router.push('/progress/body')
      : past
        ? undefined
        : () => router.push('/check-in');

  const chip =
    series.delta == null ? null : (
      <StatusChip
        area={moved ? area : 'neutral'}
        icon={moved ? (series.delta < 0 ? 'arrowDown' : 'arrowUp') : undefined}
        label={moved ? amount : t('progress.steady')}
      />
    );

  // Under a line still to come: when the value was logged, or how to log the first one.
  const emptyNote: ReactNode =
    series.latestDay != null ? (
      // Half width: "Logged Sun 18", wrapping rather than cut.
      <Text variant={small ? 'label' : 'bodyS'} muted>
        {t('today.weightOn', {
          day: small ? compactDateLabel(series.latestDay) : shortDateLabel(series.latestDay),
        })}
      </Text>
    ) : past ? (
      <Text variant="bodyS" muted>
        {t('today.past.noWeight')}
      </Text>
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="plus" size={18} color={colors.text} />
        <Text variant="bodyS" semibold>
          {t('today.logWeight')}
        </Text>
      </View>
    );

  const hasLine = series.line.length > 1;
  const goalLabel = goalText ? (
    <Text variant="label" muted numeric numberOfLines={1} style={{ flexShrink: 1 }}>
      {goalText}
    </Text>
  ) : null;

  const body = (
    <View style={{ gap: 12 }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        {/* No value yet: a dash where the number goes (the card unfilled, DECISIONS 111). */}
        <BigNumber value={value ?? '–'} unit={unitLabel} />
        {chip}
      </View>
      <PeriodLine
        values={series.line}
        from={series.from}
        to={past ? day : undefined}
        area={area}
        height={small ? 44 : 72}
        label={t(isWeight ? 'today.weightCard.weightLine' : 'today.weightCard.fatLine', {
          weeks: HOME_BODY_WEEKS,
        })}
        hasValue={series.latest != null}
        // Full width: the goal between the dates; half width: under them (no room).
        middle={small ? null : goalLabel}
        emptyNote={emptyNote}
      />
      {goalLabel && (small || !hasLine) && series.latest != null ? goalLabel : null}
    </View>
  );

  const switcher = fatLogged ? (
    <Segmented<BodyView>
      options={[
        { value: 'weight', label: t('progress.tabWeight') },
        { value: 'bodyFat', label: t('progress.tabFat') },
      ]}
      value={view}
      onChange={setView}
      accessibilityLabel={t('today.weightCard.viewA11y')}
    />
  ) : null;

  // Without the switch the whole card opens the Body page (as every Home card). With it, the
  // card holds a control, so only its body is the button (a pressable card would hide the
  // switch from screen readers).
  if (!switcher)
    return (
      <Frame
        size={size}
        label={title}
        icon="scale"
        area="neutral"
        onPress={open}
        pressLabel={series.latest == null && !past ? t('today.logWeight') : summary}
      >
        {body}
      </Frame>
    );

  return (
    <Frame
      size={size}
      label={title}
      icon="scale"
      area="neutral"
      right={small ? undefined : <View style={{ width: 190 }}>{switcher}</View>}
    >
      {small ? switcher : null}
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={summary}
        onPress={open}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[{ opacity: press.opacity }, press.style]}
      >
        {body}
      </AnimatedPressable>
    </Frame>
  );
}
