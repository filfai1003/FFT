import { useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Gauge } from '@/components/ui/Gauge';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useTheme, WorkoutThemeScope } from '@/design/use-theme';
import { nextBadges, type BadgeState, type LevelInfo } from '@/domain/gamification';
import { formatInt } from '@/domain/numbers';
import { useSessionStore } from '@/features/auth/session-store';
import { confirm, tick } from '@/lib/haptics';
import { badgeHow, badgeName } from './components';
import { useGamification, useGamificationRefresh } from './data';
import { useProgressView } from './progress-view';
import { badgeToCelebrate, loadSeenBadges, saveSeenBadges } from './seen-badges';

/** Twelve short rays around the medal (canvas BadgeUnlocked), alternating long and short. */
const RAYS = Array.from({ length: 12 }, (_, i) => {
  const a = ((i * 30 + 15) * Math.PI) / 180;
  const r1 = 70;
  const r2 = i % 2 ? 80 : 86;
  const p = (r: number) =>
    `${(110 + r * Math.cos(a)).toFixed(1)} ${(88 + r * Math.sin(a)).toFixed(1)}`;
  return `M${p(r1)}L${p(r2)}`;
});

function Medal({ badge }: { badge: BadgeState }) {
  const { colors, reduceMotion } = useTheme();
  // A short pop when it opens; static with "Reduce motion".
  const [pop] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(pop, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [pop, reduceMotion]);
  return (
    <Animated.View
      aria-hidden
      style={{
        width: 220,
        height: 176,
        alignSelf: 'center',
        opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
        transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
      }}
    >
      <Svg width={220} height={176} viewBox="0 0 220 176">
        {RAYS.map((d) => (
          <Path key={d} d={d} stroke={colors.streak} strokeWidth={3} strokeLinecap="round" />
        ))}
        <Circle cx={110} cy={88} r={62} fill={colors.surface} stroke={colors.borderDecorative} />
        <Circle cx={110} cy={88} r={56} fill="none" stroke={colors.streak} strokeWidth={6} />
        <Circle cx={110} cy={88} r={46} fill={colors.streak} />
      </Svg>
      <View style={{ position: 'absolute', top: 62, left: 84 }}>
        <Icon name={badge.glyph} size={52} color={colors.surface} />
      </View>
    </Animated.View>
  );
}

export type BadgeUnlockedProps = {
  badge: BadgeState | null;
  others: number;
  level: LevelInfo;
  next: BadgeState | null;
  onClose: () => void;
  onSeeBadges: () => void;
};

/** "Badge earned": shown once when a badge unlocks, with its XP and the next badge. */
export function BadgeUnlockedSheet({
  badge,
  others,
  level,
  next,
  onClose,
  onSeeBadges,
}: BadgeUnlockedProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!badge) return null;
  const name = badgeName(t, badge.id);
  const span = level.nextLevelXp - level.levelStartXp;
  const before = Math.max(level.levelStartXp, level.xp - badge.xp);
  return (
    <Sheet
      visible
      onClose={onClose}
      title={t('game.unlocked.title')}
      closeLabel={t('common.close')}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              variant="secondary"
              size="large"
              label={t('game.unlocked.seeBadges')}
              onPress={onSeeBadges}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button size="large" label={t('game.unlocked.nice')} onPress={onClose} />
          </View>
        </View>
      }
    >
      <View accessible accessibilityLabel={t('game.unlocked.dialog', { name })} style={{ gap: 6 }}>
        <Medal badge={badge} />
        <View style={{ alignItems: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="check" size={15} color={colors.successText} />
            <Text variant="bodyS" semibold style={{ color: colors.successText }}>
              {t('game.unlocked.title')}
            </Text>
          </View>
          <Text variant="displayM" style={{ textAlign: 'center' }} accessibilityRole="header">
            {name}
          </Text>
          <Text muted style={{ textAlign: 'center' }}>
            {badgeHow(t, badge.id)}
          </Text>
          {others > 0 ? (
            <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
              {t('game.unlocked.more', { count: others })}
            </Text>
          ) : null}
        </View>
      </View>
      <Card gap={12} style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              minHeight: 28,
              paddingHorizontal: 10,
              borderRadius: 14,
              backgroundColor: colors.streakSoft,
              justifyContent: 'center',
            }}
          >
            <Text variant="bodyS" semibold numeric style={{ color: colors.streakInk }}>
              {t('game.unlocked.xp', { xp: badge.xp })}
            </Text>
          </View>
          <Text semibold style={{ flex: 1 }}>
            {t('game.level', { level: level.level })}
          </Text>
          <Text variant="label" muted numeric>
            {t('game.xpOf', { xp: formatInt(level.xp), next: formatInt(level.nextLevelXp) })}
          </Text>
        </View>
        {/* What was there before (dark) and what the badge just added (grey). */}
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('game.unlocked.xpA11y', {
            level: level.level,
            xp: formatInt(level.xp),
            next: formatInt(level.nextLevelXp),
            added: badge.xp,
          })}
          style={{
            height: 10,
            borderRadius: 5,
            backgroundColor: colors.dotOff,
            overflow: 'hidden',
            flexDirection: 'row',
          }}
        >
          <View
            style={{
              width: `${((before - level.levelStartXp) / span) * 100}%`,
              backgroundColor: colors.streak,
            }}
          />
          <View
            style={{
              width: `${((level.xp - before) / span) * 100}%`,
              backgroundColor: colors.borderControl,
            }}
          />
        </View>
        {next ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
              paddingTop: 12,
            }}
          >
            <Gauge
              value={next.share}
              size={40}
              stroke={4}
              accessibilityLabel={t('game.progressA11y', {
                name: badgeName(t, next.id),
                current: next.current,
                target: next.target,
              })}
            >
              <Icon name={next.glyph} size={18} color={colors.text} />
            </Gauge>
            <View style={{ flex: 1 }} aria-hidden>
              <Text semibold style={{ fontSize: 14 }}>
                {t('game.unlocked.next', { name: badgeName(t, next.id) })}
              </Text>
              <Text variant="label" muted>
                {`${t('game.ofCount', { current: next.current, target: next.target })} · ${badgeHow(t, next.id)}`}
              </Text>
            </View>
          </View>
        ) : null}
      </Card>
    </Sheet>
  );
}

/**
 * Lives next to the tab bar: when a badge unlocks (computed from the data), it shows the sheet
 * once, then remembers the badge as seen on this device.
 */
export function BadgeUnlockWatcher() {
  const router = useRouter();
  // Over the workout or its summary the sheet takes the workout's theme (DECISIONS 123).
  const inWorkout = (useSegments() as string[])[0] === 'session';
  const userId = useSessionStore((s) => s.userId);
  const game = useGamification();
  useGamificationRefresh();
  const [seen, setSeen] = useState<{ user: string; ids: Set<string> | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void loadSeenBadges(userId).then((ids) => {
      if (alive) setSeen({ user: userId, ids });
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const earned = game?.badges.filter((b) => b.earned) ?? [];
  const earnedKey = earned.map((b) => b.id).join(',');
  const ready = game != null && userId != null && seen != null && seen.user === userId;
  const firstRun = ready && seen.ids == null;
  const open = ready && !firstRun ? badgeToCelebrate(earned, seen.ids) : null;

  // First run on this device: what is already earned is not news (saved, then taken as seen).
  useEffect(() => {
    if (!firstRun || !userId) return;
    const all = new Set(earnedKey ? earnedKey.split(',') : []);
    void saveSeenBadges(userId, all).then(() => setSeen({ user: userId, ids: all }));
  }, [firstRun, userId, earnedKey]);

  const openId = open?.id ?? null;
  useEffect(() => {
    if (openId) confirm();
  }, [openId]);

  if (!game || !open) return null;
  const close = (then?: () => void) => {
    tick();
    const all = new Set([
      ...(seen?.ids ?? []),
      ...game.badges.filter((b) => b.earned).map((b) => b.id),
    ]);
    if (userId) {
      setSeen({ user: userId, ids: all });
      void saveSeenBadges(userId, all);
    }
    then?.();
  };
  const sheet = (
    <BadgeUnlockedSheet
      badge={game.badges.find((b) => b.id === open.id) ?? null}
      others={open.others}
      level={game.level}
      next={nextBadges(game.badges, 1)[0] ?? null}
      onClose={() => close()}
      onSeeBadges={() =>
        close(() => {
          useProgressView.getState().setView('me');
          router.navigate('/progress');
        })
      }
    />
  );
  return inWorkout ? <WorkoutThemeScope>{sheet}</WorkoutThemeScope> : sheet;
}
