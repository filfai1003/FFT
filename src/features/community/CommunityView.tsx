import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { DotBar } from '@/components/ui/DotBar';
import { Card } from '@/components/ui/Card';
import { Skeleton, SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { space } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import {
  communityMetrics,
  communityScores,
  daysLeft,
  movement,
  topPercent,
  type CommunityMetric,
  type CommunityPeriod,
} from '@/domain/community';
import { useGamification } from '@/features/gamification/data';
import { Avatar, PillButton, dayMonth } from '@/features/gamification/components';
import { SectionHead } from '@/features/gamification/MeCards';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useExercises } from '@/features/train/exercises';
import { tick } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';
import {
  periodStartOf,
  useAnswerFriend,
  useBoard,
  useCommunityAvailable,
  useCommunityMe,
  useCommunitySubmit,
  useFriends,
  useJoinCommunity,
  useSetCommunityName,
  type BoardKey,
  type BoardRow,
} from './api';
import { useBoardChoice } from './board-store';
import { NameSheet } from './NameSheet';
import { IconTile, useAreaColors, type Area } from '@/components/ui/IconTile';

/** Colour code (DECISIONS 107): diet is nutrition, the rest is training. */
const metricArea: Record<CommunityMetric, Area> = {
  workouts: 'training',
  diet: 'nutrition',
  training: 'training',
  strength: 'training',
};

const metricIcon: Record<CommunityMetric, IconName> = {
  workouts: 'dumbbell',
  diet: 'bowl',
  training: 'calendar',
  strength: 'chart',
};

/** Height of the pinned "your place" bar over the tab bar. */
export const PINNED_HEIGHT = 82;

/** A score as shown: workouts as a count, the rest in %, strength signed. */
export function formatScore(metric: CommunityMetric, value: number): string {
  const v = Number(value);
  if (metric === 'workouts') return String(Math.round(v));
  if (metric === 'strength') return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`;
  return `${v}%`;
}

function useBoardKey(): BoardKey {
  const today = useToday();
  const { metric, subject, period } = useBoardChoice();
  return {
    metric,
    subject: metric === 'strength' ? subject : '',
    period,
    periodStart: periodStartOf(period, today),
  };
}

/** Community half of Progress (canvas ProgressCommunity / ProgressCommunityJoin). */
export function CommunityView() {
  const { t } = useTranslation();
  const available = useCommunityAvailable();
  const me = useCommunityMe();
  if (!available)
    return (
      <EmptyState
        icon="users"
        area="streak"
        title={t('community.needsAccount')}
        body={t('community.needsAccountInfo')}
      />
    );
  if (me.isError)
    return (
      <Card gap={10}>
        <Text variant="bodyS" muted>
          {t('community.error')}
        </Text>
        <Button
          variant="secondary"
          label={t('community.retry')}
          onPress={() => void me.refetch()}
        />
      </Card>
    );
  if (me.isPending)
    return (
      <SkeletonGroup accessibilityLabel={t('common.loading')}>
        <SkeletonCard lines={2} height={120} />
        <SkeletonCard lines={1} />
      </SkeletonGroup>
    );
  return me.data ? <BoardView name={me.data.name} /> : <JoinView />;
}

/** Not a member yet: what joining means, the name others will see, Join. */
function JoinView() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const profile = useProfile();
  const join = useJoinCommunity();
  const submit = useCommunitySubmit();
  const showToast = useToastStore((s) => s.show);
  const [naming, setNaming] = useState(false);
  const name = profile.data?.name?.trim() ?? '';

  return (
    <>
      <Card gap={16} style={{ paddingTop: 20, paddingBottom: 0, overflow: 'hidden' }}>
        <View style={{ gap: 6 }}>
          <Text
            variant="displayS"
            style={{ fontSize: 24, lineHeight: 29 }}
            accessibilityRole="header"
          >
            {t('community.join.title')}
          </Text>
          <Text style={{ color: colors.textMuted }}>{t('community.join.intro')}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {communityMetrics.map((m) => (
            <View
              key={m}
              style={{
                flexBasis: '48%',
                flexGrow: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: colors.bg,
                borderRadius: 14,
                padding: 10,
              }}
            >
              {/* In the area's colour, as on the board's tabs (DECISIONS 107, 114). */}
              <IconTile icon={metricIcon[m]} area={metricArea[m]} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text semibold style={{ fontSize: 14 }}>
                  {t(`community.metric.${m}`)}
                </Text>
                <Text variant="label" muted>
                  {t(`community.metricDetail.${m}`)}
                </Text>
              </View>
            </View>
          ))}
        </View>
        {/* A small podium with you on top: decoration only. */}
        <View
          aria-hidden
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 24 }}
        >
          {[
            { h: 44, size: 36, bg: colors.borderDecorative, me: false },
            { h: 70, size: 44, bg: colors.dotOn, me: true },
            { h: 30, size: 36, bg: colors.divider, me: false },
          ].map((p, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              {p.me ? (
                <Avatar name={name || '?'} size={p.size} ring />
              ) : (
                <View
                  style={{
                    width: p.size,
                    height: p.size,
                    borderRadius: p.size / 2,
                    backgroundColor: colors.borderDecorative,
                  }}
                />
              )}
              <View
                style={{
                  alignSelf: 'stretch',
                  height: p.h,
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  backgroundColor: p.bg,
                }}
              />
            </View>
          ))}
        </View>
      </Card>

      <Card gap={10} style={{ padding: 14 }}>
        <Text variant="bodyS" semibold style={{ color: colors.textMuted }}>
          {t('community.join.appearAs')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={name || '?'} size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="titleM" semibold numberOfLines={1}>
              {name || '—'}
            </Text>
            <Text variant="bodyS" muted>
              {t('community.join.yourName')}
            </Text>
          </View>
          <Button
            variant="secondary"
            size="small"
            block={false}
            label={t('community.join.change')}
            accessibilityLabel={t('community.join.changeA11y')}
            onPress={() => setNaming(true)}
          />
        </View>
        <Text variant="bodyS" muted>
          {name ? t('community.join.changeInfo') : t('community.join.noName')}
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SharedList
          title={t('community.join.othersSee')}
          icon="check"
          tone="success"
          items={[
            t('community.join.shared.name'),
            t('community.join.shared.scores'),
            t('community.join.shared.badges'),
          ]}
        />
        <SharedList
          title={t('community.join.never')}
          icon="close"
          tone="danger"
          items={[
            t('community.join.notShared.weight'),
            t('community.join.notShared.measurements'),
            t('community.join.notShared.photos'),
          ]}
        />
      </View>

      <Button
        size="large"
        label={t('community.join.button')}
        disabled={!name || join.isPending}
        onPress={async () => {
          try {
            await join.mutateAsync(name);
            showToast({ message: t('community.join.joined') });
            void submit(true);
          } catch {
            showToast({ message: t('community.error') });
          }
        }}
      />
      <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
        {t('community.join.leaveInfo')}
      </Text>
      <NameSheet visible={naming} onClose={() => setNaming(false)} />
    </>
  );
}

function SharedList({
  title,
  icon,
  tone,
  items,
}: {
  title: string;
  icon: IconName;
  tone: 'success' | 'danger';
  items: string[];
}) {
  const { colors } = useTheme();
  const ink = tone === 'success' ? colors.successText : colors.danger;
  return (
    <Card gap={8} style={{ flex: 1, flexBasis: 0, padding: 14 }}>
      <Text variant="bodyS" semibold style={{ color: colors.textMuted }} accessibilityRole="header">
        {title}
      </Text>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={icon} size={16} color={ink} />
          <Text style={{ fontSize: 14, flex: 1 }}>{item}</Text>
        </View>
      ))}
    </Card>
  );
}

/** The strength boards the user can pick: overall, the groups and exercises it has scores for. */
function useStrengthSubjects(period: CommunityPeriod): { id: string; label: string }[] {
  const { t } = useTranslation();
  const today = useToday();
  const game = useGamification();
  const exercises = useExercises();
  const muscles = new Map((exercises.data ?? []).map((e) => [e.id, e]));
  const scores = game
    ? communityScores({
        today,
        workouts: game.activity.workouts,
        dietOnTargetDays: game.activity.dietOnTargetDays,
        daily: game.activity.daily,
        planDays: 0,
        muscleOf: (id) => muscles.get(id)?.primaryMuscle,
        maxExercises: 6,
      })
    : [];
  const subjects = scores
    .filter((s) => s.period === period && s.metric === 'strength' && s.subject !== '')
    .map((s) => s.subject);
  return [
    { id: '', label: t('community.overall') },
    ...subjects.map((id) => ({
      id,
      label: id.startsWith('group:')
        ? t(`progress.group.${id.slice(6)}` as 'progress.group.chest')
        : (muscles.get(id.slice(9))?.name ?? ''),
    })),
  ];
}

/** A member: metric tabs, filters, podium, places 4–8 and friends. */
function BoardView({ name }: { name: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const profile = useProfile();
  const setName = useSetCommunityName();
  const { metric, period, set } = useBoardChoice();
  const key = useBoardKey();
  const board = useBoard(key, true);
  const friends = useFriends(key, true);
  const subjects = useStrengthSubjects(period);
  const [filters, setFilters] = useState(false);
  useCommunitySubmit();

  // The community shows the profile name: follow a change made elsewhere (Personal info).
  // Cleaned as the server does (spaces, 40 characters), so the two can match.
  const profileName = (profile.data?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const mutateName = setName.mutate;
  const synced = useRef<string | null>(null);
  useEffect(() => {
    // Once per differing name (a refused change is not retried in a loop).
    if (profileName && profileName !== name && synced.current !== profileName) {
      synced.current = profileName;
      mutateName(profileName);
    }
  }, [profileName, name, mutateName]);

  const subjectLabel = subjects.find((s) => s.id === key.subject)?.label ?? t('community.overall');
  const rows = board.data?.rows ?? [];
  const podium = rows.filter((r) => r.place <= 3).slice(0, 3);
  const rest = rows.filter((r) => r.place > 3 && r.place <= 8);
  const left = daysLeft(period, today);
  const title =
    metric === 'strength'
      ? t('community.board.title.strength', {
          subject: key.subject === '' ? t('community.metric.strength') : subjectLabel,
        })
      : t(`community.board.title.${metric}`);

  return (
    <>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={t('community.whatToCompare')}
        style={{ flexDirection: 'row', gap: 6 }}
      >
        {communityMetrics.map((m) => {
          const on = m === metric;
          return (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              aria-selected={on}
              accessibilityLabel={t(`community.metric.${m}`)}
              onPress={() => {
                tick();
                set({ metric: m, subject: '' });
              }}
              style={{
                flex: 1,
                minHeight: 64,
                borderRadius: 16,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.borderSelected : colors.borderDecorative,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <IconTile icon={metricIcon[m]} area={metricArea[m]} size={32} />
              <Text variant="bodyS" semibold={on} medium={!on}>
                {t(`community.metric.${m}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <CommunityPinned />

      {metric === 'strength' && subjects.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel={t('community.subjects')}
          style={{ marginHorizontal: -space.screenX }}
          contentContainerStyle={{ paddingHorizontal: space.screenX, gap: 8 }}
        >
          {subjects.map((s) => {
            const on = s.id === key.subject;
            return (
              <Pressable
                key={s.id || 'overall'}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                aria-pressed={on}
                accessibilityLabel={s.label}
                onPress={() => {
                  tick();
                  set({ subject: s.id });
                }}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: 22,
                  borderWidth: on ? 2 : 1,
                  borderColor: on ? colors.borderSelected : colors.borderDecorative,
                  backgroundColor: colors.surface,
                  justifyContent: 'center',
                }}
              >
                <Text semibold={on} medium={!on} style={{ fontSize: 14 }} numberOfLines={1}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <PillButton
          icon="globe"
          label={t('community.audience.everyone')}
          accessibilityLabel={t('community.compareA11y', { who: t('community.audience.everyone') })}
          onPress={() => setFilters(true)}
        />
        <PillButton
          icon="calendar"
          label={t(`community.period.${period}`)}
          accessibilityLabel={t('community.periodA11y', {
            period: t(`community.period.${period}`),
          })}
          onPress={() => setFilters(true)}
        />
        <Text variant="label" muted style={{ flex: 1, textAlign: 'right' }}>
          {left === 0 ? t('community.lastDay') : t('community.daysLeft', { count: left })}
        </Text>
      </View>

      <Card
        gap={14}
        style={{ paddingHorizontal: 14, paddingBottom: podium.length ? 0 : 16, overflow: 'hidden' }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="titleM" semibold accessibilityRole="header">
            {title}
          </Text>
          <Text variant="bodyS" muted>
            {t(`community.board.info.${metric}`, { date: dayMonth(key.periodStart) })}
          </Text>
        </View>
        {board.isError ? (
          <Text variant="bodyS" muted>
            {t('community.error')}
          </Text>
        ) : board.isPending ? (
          <SkeletonGroup accessibilityLabel={t('common.loading')}>
            <Skeleton height={140} style={{ borderRadius: 12 }} />
          </SkeletonGroup>
        ) : podium.length === 0 ? (
          <EmptyState
            card={false}
            compact
            icon="trophy"
            area="streak"
            title={t('empty.boardTitle')}
            body={t('empty.boardBody')}
          />
        ) : (
          <Podium rows={podium} metric={metric} />
        )}
      </Card>

      {rest.length > 0 ? (
        <Card gap={0} style={{ paddingVertical: 4, paddingHorizontal: 14 }}>
          {rest.map((r, i) => (
            <PlaceRow key={r.public_id} row={r} metric={metric} first={i === 0} />
          ))}
        </Card>
      ) : null}

      <SectionHead
        title={t('community.friends.title')}
        right={t('community.friends.add')}
        onRight={() => router.push('/progress/community-profile')}
      />
      <FriendsCard
        list={friends.data ?? []}
        metric={metric}
        mine={rows.find((r) => r.is_me)?.value ?? null}
      />

      <FiltersSheet
        visible={filters}
        onClose={() => setFilters(false)}
        total={board.data?.total ?? null}
      />
    </>
  );
}

function useMoveText() {
  const { t } = useTranslation();
  return (r: Pick<BoardRow, 'place' | 'place_before'>) => {
    const m = movement(r.place, r.place_before);
    return m.kind === 'same'
      ? t('community.move.same')
      : t(`community.move.${m.kind}`, { count: m.n });
  };
}

function Podium({ rows, metric }: { rows: BoardRow[]; metric: CommunityMetric }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  // Second, first, third, as on a podium (ties keep the board's order).
  const order = [rows[1], rows[0], rows[2]];
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
      {order.map((r, i) => {
        if (!r) return <View key={i} style={{ flex: 1 }} />;
        const first = i === 1;
        const block = first ? 104 : i === 0 ? 76 : 56;
        const size = first ? 60 : 46;
        return (
          <Pressable
            key={r.public_id}
            accessibilityRole="button"
            accessibilityLabel={t('community.board.podiumA11y', {
              place: r.place,
              name: r.name,
              value: formatScore(metric, r.value),
            })}
            onPress={() => {
              tick();
              router.push({ pathname: '/progress/community-profile', params: { id: r.public_id } });
            }}
            style={{ flex: 1, alignItems: 'center', gap: 6 }}
          >
            {first ? <Icon name="trophy" size={24} color={colors.streakInk} /> : null}
            <Avatar name={r.name} size={size} ring={first} />
            <Text semibold numberOfLines={1} style={{ fontSize: 14 }}>
              {r.name}
            </Text>
            <Text semibold numeric>
              {formatScore(metric, r.value)}
            </Text>
            <View
              style={{
                alignSelf: 'stretch',
                height: block,
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                backgroundColor: first
                  ? colors.streakSoft
                  : i === 0
                    ? colors.borderDecorative
                    : colors.divider,
                alignItems: 'center',
                paddingTop: 8,
              }}
            >
              <Text
                variant="displayS"
                numeric
                style={{ color: first ? colors.streakInk : colors.text }}
              >
                {r.place}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function MoveLine({
  row,
  long = false,
}: {
  row: Pick<BoardRow, 'place' | 'place_before'>;
  long?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const m = movement(row.place, row.place_before);
  const ink =
    m.kind === 'up' ? colors.successText : m.kind === 'down' ? colors.danger : colors.textMuted;
  const icon: IconName = m.kind === 'up' ? 'arrowUp' : m.kind === 'down' ? 'arrowDown' : 'minus';
  const text = long
    ? m.kind === 'same'
      ? t('community.you.same')
      : t(`community.you.${m.kind}`, { count: m.n })
    : m.kind === 'same'
      ? t('community.move.same')
      : t(`community.move.${m.kind}`, { count: m.n });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Icon name={icon} size={12} color={ink} />
      <Text variant="label" semibold style={{ color: ink }}>
        {text}
      </Text>
    </View>
  );
}

function PlaceRow({
  row,
  metric,
  first,
}: {
  row: BoardRow;
  metric: CommunityMetric;
  first: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const moveText = useMoveText();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('community.board.rowA11y', {
        place: row.place,
        name: row.name,
        value: formatScore(metric, row.value),
        move: moveText(row),
      })}
      onPress={() => {
        tick();
        router.push({ pathname: '/progress/community-profile', params: { id: row.public_id } });
      }}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.divider,
      }}
    >
      <Text semibold numeric style={{ width: 28, color: colors.textMuted }}>
        {row.place}
      </Text>
      <Avatar name={row.name} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text medium numberOfLines={1}>
          {row.name}
        </Text>
        <MoveLine row={row} />
      </View>
      <Text semibold numeric>
        {formatScore(metric, row.value)}
      </Text>
    </Pressable>
  );
}

type FriendRow = { public_id: string; name: string; status: string; value: number | null };

/**
 * A friend's score next to yours as two bars (canvas ProgressCommunity, DECISIONS 114): theirs in
 * the board's area colour, yours in the text colour. Scores below zero (strength) show no bars.
 */
function FriendBars({
  name,
  theirs,
  mine,
  metric,
}: {
  name: string;
  theirs: number;
  mine: number;
  metric: CommunityMetric;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const area = useAreaColors(metricArea[metric]);
  if (theirs < 0 || mine < 0) return null;
  const max = Math.max(theirs, mine, 1);
  const bars = [
    { who: name, value: theirs, color: area.fill },
    { who: t('community.friends.you'), value: mine, color: colors.text },
  ];
  return (
    <View aria-hidden style={{ gap: 4 }}>
      {bars.map((b) => (
        <View key={b.who} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="label" muted numberOfLines={1} style={{ width: 52 }}>
            {b.who}
          </Text>
          <DotBar
            total={100}
            on={Math.round((b.value / max) * 100)}
            size={6}
            color={b.color}
            accessibilityLabel={`${b.who} ${formatScore(metric, b.value)}`}
            style={{ flex: 1 }}
          />
        </View>
      ))}
    </View>
  );
}

function FriendsCard({
  list,
  metric,
  mine,
}: {
  list: FriendRow[];
  metric: CommunityMetric;
  /** Your score on this board, to compare with (null without one). */
  mine: number | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const answer = useAnswerFriend();
  const showToast = useToastStore((s) => s.show);
  // What a friend's line says: a request, no score, or how far ahead / behind you they are.
  const subtitle = (f: FriendRow): string => {
    if (f.status === 'asked_you') return t('community.friends.askedYou');
    if (f.status === 'asked') return t('community.friends.asked');
    if (f.value == null) return t('community.friends.noScore');
    if (mine == null) return t(`community.metric.${metric}`);
    const gap = Math.round((Number(f.value) - Number(mine)) * 10) / 10;
    if (gap === 0) return t('community.friends.level');
    const text = formatGap(metric, Math.abs(gap));
    return gap > 0
      ? t('community.friends.ahead', { gap: text })
      : t('community.friends.behind', { gap: text });
  };
  if (list.length === 0)
    return (
      <EmptyState
        compact
        icon="users"
        title={t('empty.friendsTitle')}
        body={t('empty.friendsBody')}
        action={{
          label: t('community.friends.add'),
          icon: 'plus',
          onPress: () => router.push('/progress/community-profile'),
        }}
      />
    );
  return (
    <Card gap={0} style={{ paddingVertical: 4, paddingHorizontal: 14 }}>
      {list.map((f, i) => (
        <View
          key={f.public_id}
          style={{
            minHeight: 64,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.divider,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[f.name, f.status === 'friends' ? subtitle(f) : null]
              .filter(Boolean)
              .join(', ')}
            onPress={() => {
              tick();
              router.push({ pathname: '/progress/community-profile', params: { id: f.public_id } });
            }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              minHeight: 52,
              paddingVertical: 8,
            }}
          >
            <Avatar name={f.name} size={38} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text semibold numberOfLines={1}>
                {f.name}
              </Text>
              <Text variant="bodyS" muted>
                {subtitle(f)}
              </Text>
              {f.status === 'friends' && f.value != null && mine != null ? (
                <FriendBars name={f.name} theirs={f.value} mine={mine} metric={metric} />
              ) : null}
            </View>
            {f.status === 'friends' && f.value != null ? (
              <Text semibold numeric>
                {formatScore(metric, f.value)}
              </Text>
            ) : null}
          </Pressable>
          {f.status === 'asked_you' ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Button
                size="small"
                variant="secondary"
                block={false}
                label={t('community.friends.decline')}
                accessibilityLabel={t('community.friends.declineA11y', { name: f.name })}
                onPress={async () => {
                  await answer.mutateAsync({ publicId: f.public_id, accept: false });
                  showToast({ message: t('community.friends.declined') });
                }}
              />
              <Button
                size="small"
                variant="dark"
                block={false}
                label={t('community.friends.accept')}
                accessibilityLabel={t('community.friends.acceptA11y', { name: f.name })}
                onPress={async () => {
                  await answer.mutateAsync({ publicId: f.public_id, accept: true });
                  showToast({ message: t('community.friends.accepted') });
                }}
              />
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

/** "Compare with": Everyone (free) or the Supporter choices (coming soon), and the period. */
function FiltersSheet({
  visible,
  onClose,
  total,
}: {
  visible: boolean;
  onClose: () => void;
  total: number | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { period, set } = useBoardChoice();
  const toSupporter = () => {
    onClose();
    router.push('/profile/premium');
  };
  const groups = [
    {
      id: 'everyone',
      detail: total
        ? t('community.audienceDetail.everyoneCount', { count: total })
        : t('community.audienceDetail.everyone'),
      paid: false,
    },
    { id: 'friends', detail: t('community.audienceDetail.friends'), paid: true },
    { id: 'country', detail: t('community.audienceDetail.country'), paid: true },
    { id: 'class', detail: t('community.audienceDetail.class'), paid: true },
  ] as const;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('community.filters.title')}
      closeLabel={t('common.close')}
      footer={<Button size="large" label={t('community.filters.show')} onPress={onClose} />}
    >
      <Card gap={0} style={{ paddingVertical: 4, paddingHorizontal: 12 }}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('community.filters.title')}>
          {groups.map((g, i) => {
            const on = g.id === 'everyone';
            const label = t(`community.audience.${g.id}`);
            return (
              <Pressable
                key={g.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={
                  g.paid ? t('community.supporterA11y', { name: label }) : `${label}. ${g.detail}`
                }
                onPress={() => {
                  tick();
                  if (g.paid) toSupporter();
                }}
                style={{
                  minHeight: 60,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.divider,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: on ? colors.borderSelected : colors.borderControl,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {on ? (
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: colors.dotOn,
                      }}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text semibold={on} medium={!on}>
                    {label}
                  </Text>
                  <Text variant="bodyS" muted>
                    {g.detail}
                  </Text>
                </View>
                {g.paid ? (
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
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Card>
      <View style={{ gap: 8 }}>
        <Text variant="bodyS" semibold style={{ color: colors.textMuted, paddingHorizontal: 2 }}>
          {t('community.filters.period')}
        </Text>
        <Segmented
          accessibilityLabel={t('community.filters.period')}
          value={period}
          onChange={(p: CommunityPeriod) => set({ period: p })}
          options={[
            { value: 'week', label: t('community.period.week') },
            { value: 'month', label: t('community.period.month') },
          ]}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t('community.filters.note')} ${t('community.filters.what')}`}
        onPress={toSupporter}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text variant="bodyS" style={{ color: colors.textMuted }}>
          {`${t('community.filters.note')} `}
          <Text
            variant="bodyS"
            semibold
            style={{ textDecorationLine: 'underline', color: colors.textMuted }}
          >
            {t('community.filters.what')}
          </Text>
        </Text>
      </Pressable>
    </Sheet>
  );
}

/** Your place, pinned over the tab bar while the community page is open (members only). */
export function CommunityPinned() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const me = useCommunityMe();
  const key = useBoardKey();
  const board = useBoard(key, me.data != null);
  if (!me.data) return null;
  const mine = board.data?.rows.find((r) => r.is_me) ?? null;
  const total = board.data?.total ?? 0;
  const moveText = mine ? movement(mine.place, mine.place_before) : null;
  const next = mine ? nextTarget(board.data?.rows ?? [], mine) : null;
  const a11y = mine
    ? t('community.you.a11y', {
        place: mine.place,
        total,
        move:
          moveText?.kind === 'same'
            ? t('community.you.same')
            : t(`community.you.${moveText!.kind}`, { count: moveText!.n }),
        value: formatScore(key.metric, mine.value),
      })
    : t('community.you.noScore');
  return (
    <View style={{}}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11y}
        onPress={() => {
          tick();
          router.push('/progress/community-profile');
        }}
        style={{
          minHeight: 60,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.borderDecorative,
          backgroundColor: colors.surface,
          gap: 14,
          padding: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile icon="trophy" area="streak" size={44} />
          {mine ? (
            <Text variant="displayL" numeric>
              {`#${mine.place}`}
            </Text>
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text semibold numberOfLines={1}>
              {mine
                ? t('community.you.ofTotal', { total, pct: topPercent(mine.place, total) })
                : t('community.you.noScore')}
            </Text>
            {mine ? (
              <MoveLine row={mine} long />
            ) : (
              <Text variant="label" muted>
                {t('community.you.noScoreInfo')}
              </Text>
            )}
          </View>
          {mine ? (
            <Text variant="displayS" numeric>
              {formatScore(key.metric, mine.value)}
            </Text>
          ) : null}
        </View>
        {/* How far the next place is, as a fill (canvas ProgressCommunity, DECISIONS 114). */}
        {mine && next ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text variant="bodyS" semibold style={{ flexShrink: 1 }}>
                {next.row.place === mine.place - 1
                  ? t('community.you.toPass', {
                      gap: formatGap(key.metric, next.gap),
                      name: next.row.name,
                    })
                  : t('community.you.toReach', {
                      gap: formatGap(key.metric, next.gap),
                      place: next.row.place,
                    })}
              </Text>
              <Text variant="bodyS" muted numeric>
                {`#${next.row.place} · ${formatScore(key.metric, next.row.value)}`}
              </Text>
            </View>
            <DotBar
              total={100}
              on={Math.round(next.share * 100)}
              color={colors.streak}
              track={colors.streakSoft}
              accessibilityLabel={t('community.you.nextA11y', { place: next.row.place })}
            />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * The next place to aim for: the row just above yours on the board (the board lists the top 8 and
 * you, so below 9th it is 8th), how much is missing and how far you are on the way (0..1).
 */
export function nextTarget(
  rows: readonly BoardRow[],
  mine: BoardRow,
): { row: BoardRow; gap: number; share: number } | null {
  const above = rows.filter((r) => !r.is_me && r.place < mine.place && r.value > mine.value);
  const row = above.sort((a, b) => b.place - a.place)[0];
  if (!row) return null;
  const gap = Math.round((Number(row.value) - Number(mine.value)) * 10) / 10;
  const share = Number(row.value) > 0 ? Math.max(0, Math.min(1, mine.value / row.value)) : 0;
  return { row, gap, share };
}

/** A gap between two scores: workouts as a count, the rest in points of %. */
function formatGap(metric: CommunityMetric, gap: number): string {
  return metric === 'workouts' ? String(Math.ceil(gap)) : `${gap}%`;
}

/** The member's initial in the Progress header: opens the community profile. */
export function CommunityAvatarButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useCommunityMe();
  if (!me.data) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('community.avatarA11y')}
      onPress={() => {
        tick();
        router.push('/progress/community-profile');
      }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Avatar name={me.data.name} size={44} />
    </Pressable>
  );
}

/** Space under the community page: the pinned bar for members. */
export function useCommunityBottomSpace(): number {
  return 24;
}
