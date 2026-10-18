import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { DotBar } from '@/components/ui/DotBar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { tick } from '@/lib/haptics';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel, weekdayLetter } from '@/domain/day';
import { formatInt } from '@/domain/numbers';
import type { BadgeState, LevelInfo, WeekDayState } from '@/domain/gamification';

/** "14 Oct" from a day (the weekday is dropped). */
export const dayMonth = (day: string) => shortDateLabel(day).split(' ').slice(1).join(' ');

/**
 * A badge as in the canvas: earned = filled disc with a full ring; in progress = ring filled to
 * the share; locked (nothing yet) = dashed track and a lock. The state is also in the label and
 * in the text under it, never in colour alone.
 */
export function BadgeMedal({ badge, size = 60 }: { badge: BadgeState; size?: number }) {
  const { colors } = useTheme();
  const stroke = Math.max(3, Math.round(size / 15));
  const r = (size - stroke) / 2 - 0.5;
  const c = 2 * Math.PI * r;
  const locked = !badge.earned && badge.current === 0;
  const inner = size - 16;
  return (
    <View aria-hidden style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={badge.earned ? colors.streak : locked ? colors.borderControl : colors.streakSoft}
          strokeWidth={stroke}
          strokeDasharray={locked ? '4 5' : undefined}
        />
        {!badge.earned && badge.share > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colors.streak}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * badge.share} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: badge.earned ? colors.streak : locked ? colors.surfaceAlt : colors.streakSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name={locked ? 'lock' : badge.glyph}
          size={Math.round(inner * 0.48)}
          color={badge.earned ? colors.surface : locked ? colors.textPlaceholderIcon : colors.streakInk}
        />
      </View>
    </View>
  );
}

/** An earned badge disc without a ring (Profile, public profile). */
export function BadgeDisc({
  badge,
  size = 48,
}: {
  badge: Pick<BadgeState, 'glyph'>;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.streak,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={badge.glyph} size={Math.round(size * 0.44)} color={colors.surface} />
    </View>
  );
}

/** A badge's accessible description: earned (with the date), in progress, or locked (how). */
export function useBadgeLabel() {
  const { t } = useTranslation();
  return (b: BadgeState): string => {
    const name = badgeName(t, b.id);
    if (b.earned && b.earnedOn)
      return t('game.badgeEarnedA11y', { name, date: dayMonth(b.earnedOn) });
    if (b.current === 0) return t('game.badgeLockedA11y', { name, how: badgeHow(t, b.id) });
    return t('game.progressA11y', { name, current: b.current, target: b.target });
  };
}

/** Badge texts by id (`badges.<id>.name|how`): the key is built at run time, so typed loosely. */
type LooseT = (key: string) => string;
export const badgeName = (t: unknown, id: string): string => (t as LooseT)(`badges.${id}.name`);
export const badgeHow = (t: unknown, id: string): string => (t as LooseT)(`badges.${id}.how`);

/** Level + XP bar ("Level 7 · 1,240 / 1,500 XP"). */
export function LevelBar({ level }: { level: LevelInfo }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
      >
        <Text semibold>{t('game.level', { level: level.level })}</Text>
        <Text variant="label" muted numeric>
          {t('game.xpOf', { xp: formatInt(level.xp), next: formatInt(level.nextLevelXp) })}
        </Text>
      </View>
      <DotBar
        color={colors.streak}
        track={colors.streakSoft}
        total={level.nextLevelXp - level.levelStartXp}
        on={level.xp - level.levelStartXp}
        accessibilityLabel={t('game.levelA11y', {
          level: level.level,
          xp: formatInt(level.xp),
          next: formatInt(level.nextLevelXp),
        })}
      />
    </View>
  );
}

/**
 * One day of the week strip: a filled disc with a tick (logged), a soft disc with a dash
 * (missed), an outlined disc (today, not logged yet), an empty one (still to come).
 */
export function WeekDayMark({
  state,
  size = 34,
  withIcon = true,
}: {
  state: WeekDayState;
  size?: number;
  withIcon?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor:
          state === 'done' ? colors.streak : state === 'missed' ? colors.surfaceAlt : colors.surface,
        borderWidth: state === 'today' ? 2 : state === 'future' ? 1 : 0,
        borderColor: state === 'today' ? colors.streak : colors.borderDecorative,
      }}
    >
      {withIcon && state === 'done' ? (
        <Icon name="check" size={Math.round(size * 0.47)} color={colors.surface} />
      ) : null}
      {withIcon && state === 'missed' ? (
        <Icon name="minus" size={Math.round(size * 0.41)} color={colors.textMuted} />
      ) : null}
    </View>
  );
}

/** Outlined 44px pill that opens a choice ("Last 4 weeks ▾", "Everyone ▾"). */
export function PillButton({
  label,
  icon,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  icon?: IconName;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingLeft: 14,
        paddingRight: 10,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.borderControl,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={16} color={colors.text} /> : null}
      <Text variant="body" semibold style={{ fontSize: 14 }}>
        {label}
      </Text>
      <Icon name="chevronDown" size={16} color={colors.text} />
    </Pressable>
  );
}

/** A round avatar with the name's initial (community: no photos, DECISIONS 90). */
export function Avatar({
  name,
  size = 34,
  ring = false,
}: {
  name: string;
  size?: number;
  ring?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.borderDecorative,
        borderWidth: ring ? 3 : 0,
        borderColor: colors.borderSelected,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        semibold
        style={{ fontSize: Math.round(size * 0.4), lineHeight: Math.round(size * 0.5) }}
      >
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

/** The week's letters and marks (Progress · Me). */
export function WeekStrip({ week }: { week: { day: string; state: WeekDayState }[] }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {week.map((d) => (
        <View
          key={d.day}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t(`game.week.${d.state}`, { day: shortDateLabel(d.day) })}
          style={{ alignItems: 'center', gap: 6, flex: 1 }}
        >
          <Text variant="label" muted semibold={d.state === 'today'}>
            {weekdayLetter(d.day)}
          </Text>
          <WeekDayMark state={d.state} />
        </View>
      ))}
    </View>
  );
}
