import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { DotBar } from '@/components/ui/DotBar';
import { Gauge } from '@/components/ui/Gauge';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { space } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { addDays } from '@/domain/day';
import {
  badgeCatalogue,
  nextBadges,
  nextStreakTarget,
  latestRecords,
  streakWeek,
  type BadgeState,
  type PersonalRecord,
} from '@/domain/gamification';
import { formatInt } from '@/domain/numbers';
import { displayWeight } from '@/domain/units';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useExercises } from '@/features/train/exercises';
import { tick } from '@/lib/haptics';
import {
  BadgeMedal,
  LevelBar,
  WeekStrip,
  badgeHow,
  badgeName,
  dayMonth,
  useBadgeLabel,
} from './components';
import type { GameData } from './data';

/** The canvas "Progress · Me" top card: streak ring, level + XP, this week's days. */
export function StreakCard({ game }: { game: GameData }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const week = streakWeek(game.activity.loggedDays, today, weekStart);
  const target = nextStreakTarget(game.streak);
  const targetBadge = badgeCatalogue.find((b) => b.metric === 'streak' && b.target === target);
  const todayOpen = week.some((d) => d.state === 'today');
  const title =
    game.streak === 0
      ? t('game.startStreak')
      : game.streak >= 3
        ? t('game.onARoll')
        : t('game.keepGoing');
  const detail = [
    game.streak === 0
      ? t('game.firstDay')
      : target && targetBadge
        ? t('game.moreDays', { count: target - game.streak, badge: badgeName(t, targetBadge.id) })
        : null,
    game.bestStreak > 0 ? t('game.best', { count: game.bestStreak }) : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card gap={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Gauge
          value={target ? game.streak / target : 1}
          size={120}
          stroke={10}
          color={colors.streak}
          track={colors.streakSoft}
          accessibilityLabel={
            target
              ? t('game.streakA11y', { count: game.streak, target })
              : t('game.streakA11yNoTarget', { count: game.streak })
          }
        >
          <Icon name="flame" size={20} color={colors.streakInk} />
          <Text variant="displayM" numeric style={{ fontSize: 32, lineHeight: 34 }}>
            {formatInt(game.streak)}
          </Text>
          <Text variant="label" muted>
            {t('game.dayStreak')}
          </Text>
        </Gauge>
        <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
          <View style={{ gap: 2 }}>
            <Text semibold>{title}</Text>
            {detail ? (
              <Text variant="bodyS" muted>
                {detail}
              </Text>
            ) : null}
          </View>
          <LevelBar level={game.level} />
        </View>
      </View>
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.divider,
          paddingTop: 14,
          gap: 10,
        }}
      >
        {/* The strip shows the week; the line under it only says what to do (DECISIONS 114). */}
        <WeekStrip week={week} />
        {todayOpen && game.streak > 0 ? (
          <Text variant="bodyS" semibold style={{ color: colors.streakInk }}>
            {t('game.logToday')}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/** "Next badge" with its ring, plus the two after it as small bars. */
export function NextBadgeCard({ game }: { game: GameData }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [next, ...later] = nextBadges(game.badges, 3);
  if (!next) {
    return (
      <Card gap={4}>
        <Text semibold>{t('game.allEarned')}</Text>
        <Text variant="bodyS" muted>
          {t('game.allEarnedInfo', { count: game.badges.length })}
        </Text>
      </Card>
    );
  }
  const name = badgeName(t, next.id);
  return (
    <Card gap={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Gauge
          value={next.share}
          size={68}
          stroke={6}
          color={colors.streak}
          track={colors.streakSoft}
          accessibilityLabel={t('game.nextBadgeA11y', {
            name,
            current: next.current,
            target: next.target,
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.streakSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={next.glyph} size={22} color={colors.streakInk} />
          </View>
        </Gauge>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }} aria-hidden>
          <Text variant="label" muted semibold>
            {t('game.nextBadge')}
          </Text>
          <Text variant="titleM" semibold style={{ fontSize: 18 }}>
            {name}
          </Text>
          <Text variant="bodyS" muted>
            {`${t('game.toGo', { count: next.target - next.current })} · ${badgeHow(t, next.id)}`}
          </Text>
        </View>
        <Text variant="displayS" numeric aria-hidden>
          {formatInt(next.current)}
          <Text variant="bodyS" muted numeric>{`/${formatInt(next.target)}`}</Text>
        </Text>
      </View>
      {later.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: colors.divider,
            paddingTop: 12,
          }}
        >
          {later.map((b) => (
            <View key={b.id} style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                <Text variant="bodyS" semibold numberOfLines={1} style={{ flexShrink: 1 }}>
                  {badgeName(t, b.id)}
                </Text>
                <Text variant="label" muted numeric>
                  {t('game.ofCount', { current: b.current, target: b.target })}
                </Text>
              </View>
              <DotBar
                color={colors.streak}
                track={colors.streakSoft}
                total={b.target}
                on={b.current}
                size={6}
                accessibilityLabel={t('game.progressA11y', {
                  name: badgeName(t, b.id),
                  current: b.current,
                  target: b.target,
                })}
              />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/** Section title with an optional link on the right ("New records · See all"). */
export function SectionHead({
  title,
  right,
  onRight,
  rightLabel,
}: {
  title: string;
  right?: string;
  onRight?: () => void;
  rightLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 4,
        paddingHorizontal: 2,
      }}
    >
      <Text variant="titleM" semibold accessibilityRole="header">
        {title}
      </Text>
      {right && onRight ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rightLabel ?? right}
          onPress={() => {
            tick();
            onRight();
          }}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="bodyS" semibold style={{ color: colors.textMuted }}>
            {right}
          </Text>
        </Pressable>
      ) : right ? (
        <Text variant="bodyS" muted>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

/** Text of a record's gain in the user's unit. */
export function useRecordText() {
  const { t } = useTranslation();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const exercises = useExercises();
  return (r: PersonalRecord) => {
    const name = exercises.data?.find((e) => e.id === r.exerciseId)?.name ?? '';
    const value = displayWeight(r.valueKg, unit);
    const delta = displayWeight(r.deltaKg, unit);
    return {
      name,
      value,
      unit,
      gain: t('game.gain', { delta, unit, pct: r.pct }),
      a11y: t('game.recordA11y', {
        name,
        value,
        unit,
        delta,
        pct: r.pct,
        date: dayMonth(r.day),
      }),
    };
  };
}

/** "New records": the newest record of each exercise in the last 30 days, side by side. */
export function RecordsRow({ game }: { game: GameData }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const text = useRecordText();
  const recent = latestRecords(game.records, addDays(today, -30));
  return (
    <>
      <SectionHead
        title={t('game.newRecords')}
        right={t('game.seeAll')}
        onRight={() => router.push('/progress/strength')}
      />
      {recent.length === 0 ? (
        <EmptyState
          compact
          icon="trophy"
          area="streak"
          title={t('empty.recordsTitle')}
          body={t('game.noRecords')}
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -space.screenX }}
          contentContainerStyle={{ paddingHorizontal: space.screenX, gap: 10 }}
        >
          {recent.map((r) => {
            const x = text(r);
            return (
              <Card
                key={`${r.exerciseId}-${r.day}`}
                gap={6}
                onPress={() =>
                  router.push({
                    pathname: '/progress/exercise/[exerciseId]',
                    params: { exerciseId: r.exerciseId },
                  })
                }
                accessibilityLabel={x.a11y}
                style={{ width: 156, padding: 14 }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: colors.streakSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="trophy" size={18} color={colors.streakInk} />
                </View>
                <Text semibold numberOfLines={1} style={{ fontSize: 14 }}>
                  {x.name}
                </Text>
                <Text variant="displayS" numeric style={{ fontSize: 26, lineHeight: 29 }}>
                  {formatInt(x.value)}
                  <Text variant="bodyS" muted>{` ${x.unit}`}</Text>
                </Text>
                {r.kind === 'est1rm' ? (
                  <Text variant="label" muted>
                    {t('game.est1rm')}
                  </Text>
                ) : null}
                <GainPill text={x.gain} />
                <Text variant="label" muted>
                  {dayMonth(r.day)}
                </Text>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

/** Green pill with an up arrow: a gain (the arrow says it, not only the colour). */
export function GainPill({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        minHeight: 26,
        paddingHorizontal: 9,
        borderRadius: 13,
        backgroundColor: colors.successSoft,
      }}
    >
      <Icon name="arrowUp" size={13} color={colors.successText} />
      <Text variant="label" semibold numeric style={{ color: colors.successText }}>
        {text}
      </Text>
    </View>
  );
}

/** Every badge: earned, in progress (x of y) or locked (how to unlock). */
export function BadgeGrid({ badges }: { badges: readonly BadgeState[] }) {
  const { t } = useTranslation();
  const label = useBadgeLabel();
  const earned = badges.filter((b) => b.earned).length;
  return (
    <>
      <SectionHead
        title={t('game.badges')}
        right={t('game.earnedOf', { count: earned, total: badges.length })}
      />
      <Card
        gap={16}
        style={{
          paddingHorizontal: 8,
          flexDirection: 'row',
          flexWrap: 'wrap',
          rowGap: 16,
          columnGap: 0,
        }}
      >
        {badges.map((b) => (
          <View
            key={b.id}
            accessible
            accessibilityRole="image"
            accessibilityLabel={label(b)}
            style={{ width: '25%', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}
          >
            <BadgeMedal badge={b} />
            <Text
              variant="label"
              semibold
              muted={!b.earned && b.current === 0}
              style={{ textAlign: 'center' }}
            >
              {badgeName(t, b.id)}
            </Text>
            <Text variant="label" muted style={{ textAlign: 'center' }}>
              {b.earned
                ? t('game.earned')
                : b.current === 0
                  ? badgeHow(t, b.id)
                  : t('game.ofCount', { current: b.current, target: b.target })}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
}
