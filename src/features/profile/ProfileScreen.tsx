import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { Gauge } from '@/components/ui/Gauge';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { IconTile, useAreaColors, type Area } from '@/components/ui/IconTile';
import { MenuList } from '@/components/ui/MenuList';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { deviceTimeZone, localDay } from '@/domain/day';
import { formatInt } from '@/domain/numbers';
import { cmToFeetInches, displayWeight } from '@/domain/units';
import { latestRecords, nextBadges } from '@/domain/gamification';
import { ProfileCommunityCard } from '@/features/community/ProfileCommunityCard';
import { useGoalForDay } from '@/features/diet/log';
import {
  BadgeDisc,
  badgeHow,
  badgeName,
  dayMonth,
  useBadgeLabel,
} from '@/features/gamification/components';
import { useGamification } from '@/features/gamification/data';
import { GainPill, SectionHead, useRecordText } from '@/features/gamification/MeCards';
import { useProgressView } from '@/features/gamification/progress-view';
import { useStrength } from '@/features/progress/strength';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useMonthSessions } from '@/features/train/history';
import { tick } from '@/lib/haptics';
import { goBack } from '@/lib/navigation';
import { useLatestWeight, useProfile } from './api';
import { useProfileStats } from './stats';
import { useToday } from './use-today';

/** "Filippo Rossi" -> "FR"; empty when there is no name. */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const GOALS = ['lose_fat', 'maintain', 'build_muscle'] as const;

/**
 * Your own page (the avatar on Home), after the canvas "Your profile": who you are and a few of
 * your numbers, all computed on the device; Settings sit behind the gear. The level ring, records
 * and badges come from the gamification (DECISIONS 89), computed on the device too.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const profile = useProfile();
  const weight = useLatestWeight();
  const prefs = usePreferencesStore();
  const stats = useProfileStats();
  const strength = useStrength('4w');
  const goal = useGoalForDay(today);
  const month = useMonthSessions(today.slice(0, 7));
  const game = useGamification();

  const p = profile.data;
  const name = p?.name?.trim() || t('profile.you');
  const initials = initialsOf(p?.name) || name.slice(0, 1).toUpperCase();
  const tz = p?.timezone ?? deviceTimeZone();
  const goalKey = GOALS.find((g) => g === p?.goal);

  const height =
    p?.height_cm == null
      ? null
      : prefs.lengthUnit === 'cm'
        ? t('profile.cm', { cm: Math.round(Number(p.height_cm)) })
        : (() => {
            const f = cmToFeetInches(Number(p.height_cm));
            return `${f.feet}′${f.inches}″`;
          })();
  const since = p?.created_at
    ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(
        new Date(p.created_at),
      )
    : '';
  const subtitle = [
    goalKey ? t(`profile.goal.${goalKey}`) : null,
    game
      ? t('game.xpToNext', {
          xp: formatInt(game.level.nextLevelXp - game.level.xp),
          next: game.level.level + 1,
        })
      : since
        ? t('profile.memberSince', { date: since })
        : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Only on this page, never shared: body numbers and the calorie goal.
  const privateLine = [
    weight.data
      ? `${displayWeight(weight.data.weightKg, prefs.weightUnit)} ${prefs.weightUnit}`
      : null,
    height,
    goal?.kcal != null ? t('profile.goalKcal', { kcal: formatInt(goal.kcal) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const monthSessions = (month.data ?? []).filter((s) =>
    localDay(new Date(s.startedAt), tz).startsWith(today.slice(0, 7)),
  );
  const trainingDays = new Set(monthSessions.map((s) => localDay(new Date(s.startedAt), tz))).size;
  const daysSoFar = stats.data?.daysSoFar ?? Number(today.slice(8, 10));
  const score = strength.overall;
  const none = t('profile.stats.none');
  const earned = (game?.badges ?? [])
    .filter((b) => b.earned)
    .sort((a, b) => (b.earnedOn ?? '').localeCompare(a.earnedOn ?? ''));
  const records = game ? latestRecords(game.records, '0000-01-01', 3) : [];
  const recordText = useRecordText();
  const openBadges = () => {
    useProgressView.getState().setView('me');
    router.push('/progress');
  };
  const level = game?.level;
  const badgeLabel = useBadgeLabel();
  const firstBadge = game ? nextBadges(game.badges, 1)[0] : undefined;

  const pills: {
    key: string;
    icon: IconName;
    area: Area;
    value: string;
    label: string;
    onPress: () => void;
  }[] = [
    {
      key: 'streak',
      area: 'streak',
      icon: 'flame',
      value: game ? formatInt(game.streak) : stats.data ? formatInt(stats.data.streak) : none,
      label: t('profile.stats.dayStreak'),
      onPress: openBadges,
    },
    {
      key: 'badges',
      area: 'streak',
      icon: 'medal',
      value: game ? formatInt(earned.length) : none,
      label: t('profile.stats.badges'),
      onPress: openBadges,
    },
    {
      key: 'strength',
      area: 'training',
      icon: 'chart',
      value: score == null ? none : `${score > 0 ? '+' : ''}${score}%`,
      label: t('profile.stats.strength'),
      onPress: () => router.push('/progress/strength'),
    },
  ];

  const rings: {
    key: string;
    icon: IconName;
    area: Area;
    value: string;
    label: string;
    share: number;
    a11y: string;
  }[] = [
    {
      key: 'logged',
      area: 'streak',
      icon: 'calendar',
      value: stats.data
        ? t('profile.stats.ofDays', { n: stats.data.loggedThisMonth, total: daysSoFar })
        : none,
      label: t('profile.stats.daysLogged'),
      share: stats.data ? stats.data.loggedThisMonth / Math.max(1, daysSoFar) : 0,
      a11y: t('profile.stats.daysLoggedA11y', {
        n: stats.data?.loggedThisMonth ?? 0,
        total: daysSoFar,
      }),
    },
    {
      key: 'trained',
      area: 'training',
      icon: 'dumbbell',
      value: month.data ? t('profile.stats.ofDays', { n: trainingDays, total: daysSoFar }) : none,
      label: t('profile.stats.trainingDays'),
      share: trainingDays / Math.max(1, daysSoFar),
      a11y: t('profile.stats.trainingDaysA11y', { n: trainingDays, total: daysSoFar }),
    },
  ];

  return (
    <Screen scroll bottomBarHeight={24} gap={12}>
      <TopBar
        onBack={() => goBack(router, '/')}
        backLabel={t('common.close')}
        backIcon="close"
        right={
          <IconButton
            icon="gear"
            look="outline"
            accessibilityLabel={t('profile.settings')}
            onPress={() => router.push('/profile/settings')}
          />
        }
      />

      <View style={{ alignItems: 'center', gap: 6 }}>
        {/* Canvas Profile: the level ring around the avatar, "Lv 7" under it. */}
        <View style={{ width: 112, height: 112 }}>
          <Gauge
            value={level?.progress ?? 0}
            size={112}
            stroke={6}
            // The level is an achievement: streak orange (DECISIONS 107), as on the canvas.
            color={colors.streak}
            track={colors.streakSoft}
            accessibilityLabel={
              level
                ? t('game.levelRingA11y', {
                    level: level.level,
                    pct: Math.round(level.progress * 100),
                    next: level.level + 1,
                  })
                : name
            }
          >
            <View
              aria-hidden
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="displayM">{initials}</Text>
            </View>
          </Gauge>
          {level ? (
            <View
              aria-hidden
              style={{
                position: 'absolute',
                bottom: -2,
                alignSelf: 'center',
                minHeight: 26,
                minWidth: 36,
                paddingHorizontal: 8,
                borderRadius: 13,
                backgroundColor: colors.dotOn,
                borderWidth: 2,
                borderColor: colors.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="label" semibold style={{ color: colors.surface }}>
                {t('game.levelShort', { level: level.level })}
              </Text>
            </View>
          ) : null}
        </View>
        {profile.isPending ? (
          // The name is read from the phone: placeholders rather than "You" turning into it.
          <SkeletonGroup
            accessibilityLabel={t('common.loading')}
            gap={8}
            style={{ alignItems: 'center', alignSelf: 'stretch', marginTop: 8 }}
          >
            <Skeleton width={180} height={26} />
            <Skeleton width={140} height={12} />
          </SkeletonGroup>
        ) : (
          <Text
            variant="screenTitle"
            accessibilityRole="header"
            numberOfLines={2}
            style={{ textAlign: 'center', marginTop: 4 }}
          >
            {name}
          </Text>
        )}
        {subtitle && !profile.isPending ? (
          <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {pills.map(({ key, ...s }) => (
          <StatPill key={key} {...s} />
        ))}
      </View>

      <Text
        variant="titleM"
        accessibilityRole="header"
        style={{ paddingTop: 6, paddingHorizontal: 2 }}
      >
        {t('profile.stats.thisMonth')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {rings.map(({ key, ...r }) => (
          <MonthRing key={key} {...r} />
        ))}
      </View>

      <SectionHead
        title={t('game.records')}
        right={t('game.seeAll')}
        onRight={() => router.push('/progress/strength')}
      />
      {records.length > 0 ? (
        <Card style={{ paddingVertical: 0, paddingHorizontal: 14 }} gap={0}>
          {records.map((r, i) => {
            const x = recordText(r);
            return (
              <Pressable
                key={`${r.exerciseId}-${r.day}`}
                accessibilityRole="button"
                accessibilityLabel={x.a11y}
                onPress={() => {
                  tick();
                  router.push({
                    pathname: '/progress/exercise/[exerciseId]',
                    params: { exerciseId: r.exerciseId },
                  });
                }}
                style={{
                  minHeight: 56,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.divider,
                }}
              >
                <IconTile icon="trophy" area="streak" size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text medium numberOfLines={1}>
                    {x.name}
                  </Text>
                  <Text variant="label" muted>
                    {dayMonth(r.day)}
                  </Text>
                </View>
                <Text variant="titleM" semibold numeric>{`${formatInt(x.value)} ${x.unit}`}</Text>
                <GainPill text={t('game.gainShort', { pct: r.pct })} />
              </Pressable>
            );
          })}
        </Card>
      ) : (
        <EmptyState
          compact
          icon="trophy"
          area="streak"
          title={t('empty.recordsTitle')}
          body={t('game.noRecords')}
        />
      )}

      <SectionHead
        title={t('game.badges')}
        right={t('game.badgesSeeAll', {
          count: earned.length,
          total: game?.badges.length ?? 0,
        })}
        onRight={openBadges}
      />
      <Card style={{ paddingVertical: 14, paddingHorizontal: 8, flexDirection: 'row' }} gap={4}>
        {earned.length === 0 ? (
          // No badge yet: the first one to earn, drawn as a soft (not yet orange) disc, and how.
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 6,
            }}
          >
            <IconTile icon={firstBadge?.glyph ?? 'medal'} area="streak" size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              {firstBadge ? <Text medium>{badgeName(t, firstBadge.id)}</Text> : null}
              <Text variant="bodyS" muted>
                {game ? badgeHow(t, firstBadge?.id ?? 'first_workout') : none}
              </Text>
            </View>
          </View>
        ) : (
          earned.slice(0, 4).map((b) => (
            <View
              key={b.id}
              accessible
              accessibilityRole="image"
              accessibilityLabel={badgeLabel(b)}
              style={{ flex: 1, flexBasis: 0, alignItems: 'center', gap: 6 }}
            >
              <BadgeDisc badge={b} />
              <Text variant="label" semibold style={{ textAlign: 'center' }}>
                {badgeName(t, b.id)}
              </Text>
            </View>
          ))
        )}
      </Card>

      <ProfileCommunityCard />

      <MenuList
        items={[
          {
            icon: 'chart',
            area: 'training',
            label: t('profile.links.progress'),
            onPress: () => router.push('/progress'),
          },
          {
            icon: 'clock',
            area: 'training',
            label: t('profile.links.history'),
            onPress: () => router.push('/train/history'),
          },
          {
            icon: 'bowl',
            area: 'nutrition',
            label: t('profile.links.goals'),
            value: goal
              ? goal.kcal != null
                ? t('profile.goalKcal', { kcal: formatInt(goal.kcal) })
                : t('profile.noTarget')
              : undefined,
            onPress: () => router.push('/diet-goals'),
          },
        ]}
      />

      {privateLine ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('profile.privateLine', { line: privateLine })}. ${t('profile.links.personal')}`}
          onPress={() => {
            tick();
            router.push('/profile-edit');
          }}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 2,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="lock" size={16} color={colors.textMuted} />
          <Text variant="bodyS" muted style={{ flex: 1 }}>
            {t('profile.privateLine', { line: privateLine })}
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

/**
 * One of the three numbers under the name (canvas "Your profile"): a tile in the area's soft
 * colour (streak and badges orange, strength purple, DECISIONS 107), its icon and label in the
 * area's ink, so the three read apart before their words.
 */
function StatPill({
  icon,
  area,
  value,
  label,
  onPress,
}: {
  icon: IconName;
  area: Area;
  value: string;
  label: string;
  onPress: () => void;
}) {
  const c = useAreaColors(area);
  return (
    <Card
      size="small"
      gap={2}
      onPress={() => {
        tick();
        onPress();
      }}
      accessibilityLabel={`${value} ${label}`}
      style={{
        flex: 1,
        flexBasis: 0,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: c.soft,
        borderColor: c.soft,
      }}
    >
      <Icon name={icon} size={20} color={c.ink} />
      <Text variant="displayS" numeric numberOfLines={1}>
        {value}
      </Text>
      <Text variant="label" semibold numberOfLines={2} style={{ color: c.ink }}>
        {label}
      </Text>
    </Card>
  );
}

/** "This month": a ring filled in the area's colour around its icon, the count beside it. */
function MonthRing({
  icon,
  area,
  value,
  label,
  share,
  a11y,
}: {
  icon: IconName;
  area: Area;
  value: string;
  label: string;
  share: number;
  a11y: string;
}) {
  const c = useAreaColors(area);
  return (
    <Card
      gap={10}
      style={{ flex: 1, flexBasis: 0, padding: 12, flexDirection: 'row', alignItems: 'center' }}
    >
      <Gauge
        value={share}
        size={48}
        stroke={5}
        color={c.fill}
        track={c.soft}
        accessibilityLabel={a11y}
      >
        <Icon name={icon} size={20} color={c.ink} />
      </Gauge>
      <View style={{ flex: 1, minWidth: 0 }} aria-hidden>
        <Text variant="displayS" numeric numberOfLines={1}>
          {value}
        </Text>
        <Text variant="bodyS" muted>
          {label}
        </Text>
      </View>
    </Card>
  );
}
