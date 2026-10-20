import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Gauge } from '@/components/ui/Gauge';
import { useAreaColors } from '@/components/ui/IconTile';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { QrCode } from '@/components/ui/QrCode';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton, SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { badgeCatalogue, levelFor, xpForLevel } from '@/domain/gamification';
import { type CommunityMetric } from '@/domain/community';
import { cleanLook } from '@/domain/community-look';
import { BadgeDisc, badgeName } from '@/features/gamification/components';
import { LookLine, MemberAvatar } from './MemberAvatar';
import { SectionHead } from '@/features/gamification/MeCards';
import { useGamification } from '@/features/gamification/data';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import {
  useAddFriend,
  useCommunityMe,
  useCommunitySubmit,
  useJoinCommunity,
  useLeaveCommunity,
  usePublicProfile,
  useRemoveFriend,
} from './api';
import { formatScore } from './CommunityView';
import { useProgressView } from '@/features/gamification/progress-view';

const statIcon: Record<CommunityMetric, IconName> = {
  workouts: 'dumbbell',
  diet: 'bowl',
  training: 'calendar',
  strength: 'chart',
};

const monthYear = (iso: string) =>
  new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(iso));

/**
 * A member's public page (canvas PublicProfile). Without `publicId`: your own, as others see it,
 * with your friend code and Leave the community. With one: someone else's, with Add friend.
 */
export function PublicProfileScreen({ publicId }: { publicId?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const me = useCommunityMe();
  const profile = usePublicProfile(publicId ?? null, me.data != null);
  const game = useGamification();
  const add = useAddFriend();
  const remove = useRemoveFriend();
  const showToast = useToastStore((s) => s.show);
  const [codeOpen, setCodeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const p = profile.data;
  const own = p?.is_me ?? !publicId;
  // Your own ring uses the exact XP on the device; others' only their level.
  const level = own && game ? game.level : levelFor(xpForLevel(p?.level ?? 1));
  const monthScores = (p?.scores ?? []).filter((s) => s.period === 'month');
  const scoreOf = (m: CommunityMetric) => monthScores.find((s) => s.metric === m);
  const places = [...(p?.scores ?? [])].sort((a, b) => a.top_pct - b.top_pct).slice(0, 2);
  const badges = badgeCatalogue.filter((b) => p?.badges.includes(b.id));
  const look = cleanLook(p?.look);

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        <TopBar onBack={() => goBack(router, '/progress')} backLabel={t('common.back')} />
        {profile.isError ? (
          <Card>
            <Text variant="bodyS" muted>
              {publicId ? t('community.profile.notFound') : t('community.error')}
            </Text>
          </Card>
        ) : null}
        {!p && (profile.isLoading || me.isLoading) ? (
          <SkeletonGroup accessibilityLabel={t('common.loading')}>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Skeleton width={112} height={112} round />
              <Skeleton width={160} height={24} />
            </View>
            <SkeletonCard lines={1} />
            <SkeletonCard lines={1} />
          </SkeletonGroup>
        ) : null}
        {own && p ? (
          <View
            accessibilityRole="text"
            style={{
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.borderControl,
              backgroundColor: colors.surface,
              borderRadius: 16,
              paddingVertical: 10,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Icon name="eye" size={19} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Text semibold style={{ fontSize: 14 }}>
                {t('community.profile.note')}
              </Text>
              <Text variant="label" muted>
                {t('community.profile.noteInfo')}
              </Text>
            </View>
          </View>
        ) : null}

        {p ? (
          <>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={{ width: 112, height: 112 }}>
                {/* The level is an achievement: orange (DECISIONS 107). */}
                <Gauge
                  value={level.progress}
                  size={112}
                  stroke={6}
                  color={colors.streak}
                  track={colors.streakSoft}
                  accessibilityLabel={t('game.levelRingA11y', {
                    level: p.level,
                    pct: Math.round(level.progress * 100),
                    next: p.level + 1,
                  })}
                >
                  <MemberAvatar name={p.name} look={look} size={88} />
                </Gauge>
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
                    backgroundColor: colors.streakInk,
                    borderWidth: 2,
                    borderColor: colors.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="label" semibold style={{ color: colors.surface }}>
                    {t('game.levelShort', { level: p.level })}
                  </Text>
                </View>
              </View>
              <Text
                variant="screenTitle"
                accessibilityRole="header"
                style={{ textAlign: 'center' }}
              >
                {p.name}
              </Text>
              <LookLine look={look} size={20} />
              <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
                {`${t('community.profile.since', { date: monthYear(p.joined_at) })} · ${t(
                  'community.profile.badges',
                  { count: p.badges.length },
                )}`}
              </Text>
            </View>

            {own ? (
              <Button
                variant="secondary"
                icon="palette"
                label={t('look.entry')}
                onPress={() => router.push('/profile/customize')}
              />
            ) : null}

            {!own ? (
              p.friend === 'friends' ? (
                <Button
                  variant="secondary"
                  icon="check"
                  label={t('community.profile.removeFriend')}
                  onPress={async () => {
                    await remove.mutateAsync(p.public_id);
                    showToast({
                      message: t('community.profile.removed'),
                      actionLabel: t('common.undo'),
                      onAction: () => void add.mutateAsync({ publicId: p.public_id }),
                    });
                  }}
                />
              ) : (
                <Button
                  variant="dark"
                  icon={p.friend === 'asked' ? 'check' : 'plus'}
                  label={
                    p.friend === 'asked'
                      ? t('community.profile.requested')
                      : p.friend === 'asked_you'
                        ? t('community.friends.accept')
                        : t('community.profile.addFriend')
                  }
                  disabled={p.friend === 'asked' || add.isPending}
                  onPress={async () => {
                    const r = await add.mutateAsync({ publicId: p.public_id });
                    showToast({
                      message:
                        r === 'friends' ? t('community.code.nowFriends') : t('community.code.sent'),
                    });
                  }}
                />
              )
            ) : null}

            <SectionHead title={t('community.profile.thisMonth')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {(['workouts', 'diet', 'training', 'strength'] as const).map((m) => (
                <StatCard key={m} metric={m} score={scoreOf(m)?.value ?? null} />
              ))}
            </View>

            {places.length > 0 ? (
              <Card gap={0} style={{ paddingVertical: 4, paddingHorizontal: 14 }}>
                {places.map((s, i) => (
                  <View
                    key={`${s.period}-${s.metric}`}
                    accessible
                    accessibilityLabel={`${t('community.profile.top', { pct: s.top_pct })}, ${t(
                      `community.profile.placeWhat.${s.metric}`,
                    )}, ${t(`community.profile.placeWhen.${s.period}`, { place: s.place, total: s.total })}`}
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
                        minHeight: 30,
                        paddingHorizontal: 10,
                        borderRadius: 15,
                        backgroundColor: colors.surfaceAlt,
                        justifyContent: 'center',
                      }}
                    >
                      <Text variant="bodyS" semibold numeric>
                        {t('community.profile.top', { pct: s.top_pct })}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text medium>{t(`community.profile.placeWhat.${s.metric}`)}</Text>
                      <Text variant="label" muted>
                        {t(`community.profile.placeWhen.${s.period}`, {
                          place: s.place,
                          total: s.total,
                        })}
                      </Text>
                    </View>
                    <Icon name="trophy" size={18} color={colors.streakInk} />
                  </View>
                ))}
              </Card>
            ) : null}

            <SectionHead title={t('community.profile.badgesOnShow')} />
            <Card
              gap={4}
              style={{
                paddingVertical: 16,
                paddingHorizontal: 8,
                flexDirection: 'row',
                flexWrap: 'wrap',
                rowGap: 14,
              }}
            >
              {badges.length === 0 ? (
                <Text variant="bodyS" muted style={{ paddingHorizontal: 6 }}>
                  {t('community.profile.noBadges')}
                </Text>
              ) : (
                badges.map((b) => (
                  <View key={b.id} style={{ width: '24%', alignItems: 'center', gap: 6 }}>
                    <BadgeDisc badge={b} />
                    <Text variant="label" semibold style={{ textAlign: 'center' }}>
                      {badgeName(t, b.id)}
                    </Text>
                  </View>
                ))
              )}
            </Card>

            {own && me.data ? (
              <>
                <SectionHead title={t('community.friends.title')} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      variant="secondary"
                      icon="qr"
                      label={t('community.code.my')}
                      onPress={() => setCodeOpen(true)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      variant="secondary"
                      icon="plus"
                      label={t('community.code.add')}
                      onPress={() => setAddOpen(true)}
                    />
                  </View>
                </View>
              </>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 2 }}>
              <Icon name="shield" size={18} color={colors.successText} />
              <Text variant="bodyS" style={{ flex: 1, color: colors.textMuted }}>
                {t('community.profile.privacy')}
              </Text>
            </View>
            {own && me.data ? (
              <Button
                variant="danger"
                label={t('community.profile.leave')}
                onPress={() => setLeaving(true)}
              />
            ) : null}
          </>
        ) : null}
      </Screen>

      {me.data ? (
        <>
          <MyCodeSheet
            visible={codeOpen}
            onClose={() => setCodeOpen(false)}
            code={me.data.invite_code}
          />
          <AddByCodeSheet visible={addOpen} onClose={() => setAddOpen(false)} />
          <LeaveSheet visible={leaving} onClose={() => setLeaving(false)} name={me.data.name} />
        </>
      ) : null}
    </>
  );
}

/**
 * One of this month's scores as a ring in its area's colour (DECISIONS 107, 114): training
 * purple, diet teal; a strength loss in red. Without a score, an empty ring and "No score yet".
 */
function StatCard({ metric, score }: { metric: CommunityMetric; score: number | null }) {
  const { t } = useTranslation();
  const c = useAreaColors(
    metric === 'diet'
      ? 'nutrition'
      : metric === 'strength' && (score ?? 0) < 0
        ? 'worse'
        : 'training',
  );
  const label = t(`community.profile.stat.${metric}`);
  const value = score != null ? formatScore(metric, score) : null;
  const share =
    score == null
      ? 0
      : metric === 'workouts'
        ? Math.min(1, score / 20)
        : metric === 'strength'
          ? Math.min(1, Math.abs(score) / 10)
          : score / 100;
  return (
    <Card
      gap={12}
      style={{
        flexBasis: '47%',
        flexGrow: 1,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Gauge
        value={share}
        size={48}
        stroke={5}
        color={c.fill}
        track={c.soft}
        accessibilityLabel={t('community.profile.statA11y', {
          label,
          value: value ?? t('community.friends.noScore'),
        })}
      >
        <Icon name={statIcon[metric]} size={20} color={c.ink} />
      </Gauge>
      <View style={{ flex: 1, minWidth: 0 }} aria-hidden>
        {value != null ? (
          <Text variant="displayS" numeric numberOfLines={1}>
            {value}
          </Text>
        ) : (
          <Text variant="bodyS" semibold muted numberOfLines={1}>
            {t('community.friends.noScore')}
          </Text>
        )}
        <Text variant="label" muted>
          {label}
        </Text>
      </View>
    </Card>
  );
}

function MyCodeSheet({
  visible,
  onClose,
  code,
}: {
  visible: boolean;
  onClose: () => void;
  code: string;
}) {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('community.code.title')}
      closeLabel={t('common.close')}
      footer={
        <Button
          size="large"
          variant="secondary"
          icon="copy"
          label={t('community.code.copy')}
          onPress={async () => {
            await Clipboard.setStringAsync(code);
            showToast({ message: t('community.code.copied') });
          }}
        />
      }
    >
      <QrCode
        value={code}
        size={180}
        label={t('community.code.qrA11y', { code: code.split('').join(' ') })}
      />
      <Text variant="displayM" numeric selectable style={{ textAlign: 'center', letterSpacing: 4 }}>
        {code}
      </Text>
      <Text variant="bodyS" muted>
        {t('community.code.info')}
      </Text>
    </Sheet>
  );
}

function AddByCodeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const add = useAddFriend();
  const showToast = useToastStore((s) => s.show);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const clean = code.trim().toUpperCase();
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setCode('');
        setError(null);
        onClose();
      }}
      title={t('community.code.add')}
      closeLabel={t('common.close')}
      footer={
        <Button
          size="large"
          label={t('community.code.send')}
          disabled={clean.length < 6 || add.isPending}
          onPress={async () => {
            try {
              const r = await add.mutateAsync({ code: clean });
              setCode('');
              setError(null);
              onClose();
              showToast({
                message:
                  r === 'friends' ? t('community.code.nowFriends') : t('community.code.sent'),
              });
            } catch (e) {
              const c = (e as { code?: string }).code;
              setError(
                c === 'P0002'
                  ? t('community.code.unknown')
                  : c === '22023'
                    ? t('community.code.own')
                    : t('community.error'),
              );
            }
          }}
        />
      }
    >
      <Input
        label={t('community.code.label')}
        value={code}
        onChangeText={(v) => {
          setCode(v);
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        error={error ?? undefined}
        autoFocus
      />
    </Sheet>
  );
}

/** Confirm, leave at once (everything deleted on the server), and offer to join back. */
function LeaveSheet({
  visible,
  onClose,
  name,
}: {
  visible: boolean;
  onClose: () => void;
  name: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const leave = useLeaveCommunity();
  const join = useJoinCommunity();
  const submit = useCommunitySubmit();
  const showToast = useToastStore((s) => s.show);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('community.profile.leaveTitle')}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            size="large"
            variant="danger"
            label={t('community.profile.leaveYes')}
            disabled={leave.isPending}
            onPress={async () => {
              try {
                await leave.mutateAsync();
              } catch {
                showToast({ message: t('community.error') });
                return;
              }
              onClose();
              useProgressView.getState().setView('community');
              goBack(router, '/progress');
              showToast({
                message: t('community.profile.left'),
                actionLabel: t('common.undo'),
                onAction: async () => {
                  await join.mutateAsync(name);
                  void submit(true);
                  showToast({ message: t('community.profile.rejoined') });
                },
              });
            }}
          />
          <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
        </View>
      }
    >
      <Text muted>{t('community.profile.leaveInfo')}</Text>
    </Sheet>
  );
}
