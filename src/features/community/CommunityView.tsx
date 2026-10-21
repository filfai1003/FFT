import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View, type PressableProps } from 'react-native';
import { Button } from '@/components/ui/Button';
import { DotBar } from '@/components/ui/DotBar';
import { Card } from '@/components/ui/Card';
import { Skeleton, SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { InfoButton, type ExplainTopic } from '@/components/ui/InfoButton';
import { Text } from '@/components/ui/Text';
import { space } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import {
  canFilterAudience,
  communityAudiences,
  communityMetrics,
  communityScores,
  daysLeft,
  isPaidAudience,
  movement,
  topPercent,
  weightClassRange,
  type CommunityAudience,
  type CommunityMetric,
  type CommunityPeriod,
} from '@/domain/community';
import { useGamification } from '@/features/gamification/data';
import { Avatar, dayMonth } from '@/features/gamification/components';
import { cleanLook, type Look } from '@/domain/community-look';
import { LookLine, MemberAvatar, SupporterBadge, useLookA11y } from './MemberAvatar';
import { usePlanStore } from '@/lib/plan';
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
  type Board,
  type BoardKey,
  type BoardRow,
} from './api';
import { useBoardChoice } from './board-store';
import { DropdownButton, DropdownMenu, type DropdownOption } from './Dropdown';
import { NameSheet } from './NameSheet';
import { ReportPhotoSheet, type ReportTarget } from './ReportPhotoSheet';
import { IconTile, useAreaColors, type Area } from '@/components/ui/IconTile';

/** Colour code (DECISIONS 107): diet is nutrition, the rest is training. */
/** How each leaderboard's score is counted (DECISIONS 124). */
const boardTopic: Record<CommunityMetric, ExplainTopic> = {
  workouts: 'boardWorkouts',
  diet: 'boardDiet',
  training: 'boardTraining',
  strength: 'boardStrength',
};

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

/** Supporter or Premium (DECISIONS 117): the paid audiences can be chosen. */
function useCanFilter(): boolean {
  return canFilterAudience(usePlanStore((s) => s.plan));
}

function useBoardKey(): BoardKey {
  const today = useToday();
  const canFilter = useCanFilter();
  const { metric, subject, period, audience } = useBoardChoice();
  return {
    metric,
    subject: metric === 'strength' ? subject : '',
    period,
    periodStart: periodStartOf(period, today),
    // A plan that ended falls back to Everyone (the server would refuse the others).
    audience: canFilter ? audience : 'everyone',
  };
}

/** A country's name in the app's language ("Italy"), or its code where the phone cannot say. */
function countryName(code: string, language: string): string {
  try {
    const Names = (
      Intl as unknown as {
        DisplayNames?: new (l: string[], o: { type: 'region' }) => { of: (c: string) => string };
      }
    ).DisplayNames;
    return Names ? (new Names([language], { type: 'region' }).of(code) ?? code) : code;
  } catch {
    return code;
  }
}

/** "74–83 kg", "Up to 59 kg", "Over 120 kg". */
function useClassLabel() {
  const { t } = useTranslation();
  return (code: string) => {
    const r = weightClassRange(code);
    if (!r) return '';
    if (r.from == null) return t('community.weightClass.upTo', { to: r.to });
    if (r.to == null) return t('community.weightClass.over', { from: r.from });
    return t('community.weightClass.range', { from: r.from, to: r.to });
  };
}

/** The board's audience as one line: "Everyone", "Friends", "Italy", "25-34 · 74–83 kg". */
function useAudienceLine() {
  const { t, i18n } = useTranslation();
  const classLabel = useClassLabel();
  return (audience: CommunityAudience, board: Board | undefined) => {
    if (audience === 'country' && board?.country)
      return countryName(board.country, i18n.language || 'en');
    if (audience === 'class' && board?.age_group && board.weight_class)
      return t('community.classLine', {
        age: board.age_group,
        weight: classLabel(board.weight_class),
      });
    return t(`community.audience.${audience}`);
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

/**
 * Why a board could not be read: a server without the audiences yet (it does not know the
 * filter), a plan that does not include filters, or the network.
 */
export function boardErrorKey(
  error: unknown,
): 'community.errorFilterUnavailable' | 'community.errorFilterPlan' | 'community.error' {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'PGRST202' || code === '42883') return 'community.errorFilterUnavailable';
  if (code === '42501') return 'community.errorFilterPlan';
  return 'community.error';
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
  const canFilter = useCanFilter();
  const audienceLine = useAudienceLine();
  // One dropdown open at a time: who to compare with, or the period.
  const [open, setOpen] = useState<'who' | 'period' | null>(null);
  // A member's photo reported from a row's long press (DECISIONS 120).
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
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
        <DropdownButton
          icon={key.audience === 'friends' || key.audience === 'class' ? 'users' : 'globe'}
          value={t(`community.audience.${key.audience}`)}
          expanded={open === 'who'}
          accessibilityLabel={t('community.compareA11y', {
            who: t(`community.audience.${key.audience}`),
          })}
          onPress={() => setOpen(open === 'who' ? null : 'who')}
        />
        <DropdownButton
          icon="calendar"
          value={t(`community.period.${period}`)}
          expanded={open === 'period'}
          accessibilityLabel={t('community.periodA11y', {
            period: t(`community.period.${period}`),
          })}
          onPress={() => setOpen(open === 'period' ? null : 'period')}
        />
        <Text variant="label" muted style={{ flex: 1, textAlign: 'right' }}>
          {left === 0 ? t('community.lastDay') : t('community.daysLeft', { count: left })}
        </Text>
      </View>
      {open === 'who' ? (
        <AudienceMenu
          canFilter={canFilter}
          value={key.audience}
          total={key.audience === 'everyone' ? (board.data?.total ?? null) : null}
          onDone={() => setOpen(null)}
        />
      ) : open === 'period' ? (
        <DropdownMenu
          label={t('community.filters.period')}
          value={period}
          options={(['week', 'month'] as const).map((p) => ({
            value: p,
            label: t(`community.period.${p}`),
          }))}
          onSelect={(p: CommunityPeriod) => {
            set({ period: p });
            setOpen(null);
          }}
        />
      ) : null}

      <Card
        gap={14}
        style={{ paddingHorizontal: 14, paddingBottom: podium.length ? 0 : 16, overflow: 'hidden' }}
      >
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="titleM" semibold accessibilityRole="header" style={{ flexShrink: 1 }}>
              {title}
            </Text>
            <InfoButton topic={boardTopic[metric]} />
          </View>
          {key.audience !== 'everyone' ? (
            <Text variant="bodyS" semibold>
              {audienceLine(key.audience, board.data)}
            </Text>
          ) : null}
          <Text variant="bodyS" muted>
            {t(`community.board.info.${metric}`, { date: dayMonth(key.periodStart) })}
          </Text>
        </View>
        {board.isError ? (
          <Text variant="bodyS" muted>
            {t(boardErrorKey(board.error))}
          </Text>
        ) : board.isPending ? (
          <SkeletonGroup accessibilityLabel={t('common.loading')}>
            <Skeleton height={140} style={{ borderRadius: 12 }} />
          </SkeletonGroup>
        ) : board.data?.reason === 'no_country' || board.data?.reason === 'no_class' ? (
          <EmptyState
            card={false}
            compact
            icon={board.data.reason === 'no_country' ? 'globe' : 'users'}
            area="streak"
            title={t(`community.empty.${board.data.reason}.title`)}
            body={t(`community.empty.${board.data.reason}.body`)}
          />
        ) : podium.length === 0 ? (
          <EmptyState
            card={false}
            compact
            icon="trophy"
            area="streak"
            title={t('empty.boardTitle')}
            body={
              key.audience === 'friends' ? t('community.empty.friendsBody') : t('empty.boardBody')
            }
          />
        ) : (
          <Podium rows={podium} metric={metric} onReport={setReporting} />
        )}
      </Card>

      {rest.length > 0 ? (
        <Card gap={0} style={{ paddingVertical: 4, paddingHorizontal: 14 }}>
          {rest.map((r, i) => (
            <PlaceRow
              key={r.public_id}
              row={r}
              metric={metric}
              first={i === 0}
              onReport={setReporting}
            />
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
        onReport={setReporting}
      />
      <ReportPhotoSheet target={reporting} onClose={() => setReporting(null)} />
    </>
  );
}

/**
 * A long press on a member's row reports its photo (DECISIONS 120), also offered to screen readers
 * as an action of the row ("Report photo"). Nothing for your own row or without a photo.
 */
function useReportProps(onReport: (target: ReportTarget) => void) {
  const { t } = useTranslation();
  return (
    m: { public_id: string; name: string; is_me?: boolean },
    look: Look | null,
  ): Partial<PressableProps> => {
    const photo = look?.photo;
    if (!photo || m.is_me) return {};
    const open = () => onReport({ publicId: m.public_id, name: m.name, photo });
    return {
      onLongPress: open,
      accessibilityActions: [{ name: 'report', label: t('report.action') }],
      onAccessibilityAction: (e) => {
        if (e.nativeEvent.actionName === 'report') open();
      },
    };
  };
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

function Podium({
  rows,
  metric,
  onReport,
}: {
  rows: BoardRow[];
  metric: CommunityMetric;
  onReport: (target: ReportTarget) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const lookA11y = useLookA11y();
  const reportProps = useReportProps(onReport);
  // Second, first, third, as on a podium (ties keep the board's order).
  const order = [rows[1], rows[0], rows[2]];
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
      {order.map((r, i) => {
        if (!r) return <View key={i} style={{ flex: 1 }} />;
        const first = i === 1;
        const block = first ? 104 : i === 0 ? 76 : 56;
        const size = first ? 60 : 46;
        const look = cleanLook(r.look);
        return (
          <Pressable
            key={r.public_id}
            accessibilityRole="button"
            accessibilityLabel={t('community.board.podiumA11y', {
              place: r.place,
              name: `${r.name}${lookA11y(look)}`,
              value: formatScore(metric, r.value),
            })}
            {...reportProps(r, look)}
            onPress={() => {
              tick();
              router.push({ pathname: '/progress/community-profile', params: { id: r.public_id } });
            }}
            style={{ flex: 1, alignItems: 'center', gap: 6 }}
          >
            {first ? <Icon name="trophy" size={24} color={colors.streakInk} /> : null}
            <MemberAvatar name={r.name} look={look} size={size} ring={first} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
              <Text semibold numberOfLines={1} style={{ fontSize: 14, flexShrink: 1 }}>
                {r.name}
              </Text>
              {look?.supporter ? <SupporterBadge size={16} /> : null}
            </View>
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
  onReport,
}: {
  row: BoardRow;
  metric: CommunityMetric;
  first: boolean;
  onReport: (target: ReportTarget) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const moveText = useMoveText();
  const lookA11y = useLookA11y();
  const reportProps = useReportProps(onReport);
  const look = cleanLook(row.look);
  return (
    <Pressable
      {...reportProps(row, look)}
      accessibilityRole="button"
      accessibilityLabel={t('community.board.rowA11y', {
        place: row.place,
        name: `${row.name}${lookA11y(look)}`,
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
      <MemberAvatar name={row.name} look={look} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text medium numberOfLines={1} style={{ flexShrink: 1 }}>
            {row.name}
          </Text>
          <LookLine look={look} size={16} />
        </View>
        <MoveLine row={row} />
      </View>
      <Text semibold numeric>
        {formatScore(metric, row.value)}
      </Text>
    </Pressable>
  );
}

type FriendRow = {
  public_id: string;
  name: string;
  status: string;
  value: number | null;
  look?: unknown;
};

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
  onReport,
}: {
  list: FriendRow[];
  metric: CommunityMetric;
  /** Your score on this board, to compare with (null without one). */
  mine: number | null;
  onReport: (target: ReportTarget) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const answer = useAnswerFriend();
  const showToast = useToastStore((s) => s.show);
  const lookA11y = useLookA11y();
  const reportProps = useReportProps(onReport);
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
            {...reportProps(f, cleanLook(f.look))}
            accessibilityRole="button"
            accessibilityLabel={[
              `${f.name}${lookA11y(cleanLook(f.look))}`,
              f.status === 'friends' ? subtitle(f) : null,
            ]
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
            <MemberAvatar name={f.name} look={cleanLook(f.look)} size={38} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text semibold numberOfLines={1} style={{ flexShrink: 1 }}>
                  {f.name}
                </Text>
                <LookLine look={cleanLook(f.look)} size={16} />
              </View>
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

/**
 * "Compare with" (DECISIONS 117): Everyone for every member; Friends, Country, Age and weight
 * class for Supporter and Premium. Without those plans they carry the Supporter tag and open the
 * Plans page.
 */
function AudienceMenu({
  canFilter,
  value,
  total,
  onDone,
}: {
  canFilter: boolean;
  value: CommunityAudience;
  total: number | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { set } = useBoardChoice();
  const toPlans = () => {
    onDone();
    router.push('/profile/premium');
  };
  const options: DropdownOption<CommunityAudience>[] = communityAudiences.map((a) => {
    const label = t(`community.audience.${a}`);
    const detail =
      a === 'everyone' && total
        ? t('community.audienceDetail.everyoneCount', { count: total })
        : t(`community.audienceDetail.${a}`);
    const locked = isPaidAudience(a) && !canFilter;
    return {
      value: a,
      label,
      detail,
      tag: locked ? t('community.supporterTag') : undefined,
      accessibilityLabel: locked ? t('community.supporterA11y', { name: label }) : undefined,
    };
  });
  return (
    <DropdownMenu
      label={t('community.filters.title')}
      value={value}
      options={options}
      onSelect={(a) => {
        if (isPaidAudience(a) && !canFilter) return toPlans();
        set({ audience: a });
        onDone();
      }}
      footer={
        canFilter ? (
          <Text variant="bodyS" muted style={{ paddingVertical: 10 }}>
            {t('community.filters.notePaid')}
          </Text>
        ) : (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${t('community.filters.note')} ${t('community.filters.what')}`}
            onPress={toPlans}
            style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 8 }}
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
        )
      }
    />
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
      <MemberAvatar name={me.data.name} look={cleanLook(me.data.look)} size={44} />
    </Pressable>
  );
}

/** Space under the community page: the pinned bar for members. */
export function useCommunityBottomSpace(): number {
  return 24;
}
