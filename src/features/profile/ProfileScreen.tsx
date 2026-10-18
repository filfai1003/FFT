import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Gauge } from '@/components/ui/Gauge';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { MenuList } from '@/components/ui/MenuList';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { deviceTimeZone, localDay } from '@/domain/day';
import { formatInt } from '@/domain/numbers';
import { cmToFeetInches, displayWeight } from '@/domain/units';
import { useGoalForDay } from '@/features/diet/log';
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
 * your numbers, all computed on the device; Settings sit behind the gear. Levels, badges, records
 * and friends (canvas "Progress · Me" / community) are planned, not built: they will go under
 * "This month", where the canvas has them.
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
    since ? t('profile.memberSince', { date: since }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Only on this page, never shared: body numbers and the calorie goal.
  const privateLine = [
    weight.data
      ? `${displayWeight(weight.data.weightKg, prefs.weightUnit)} ${prefs.weightUnit}`
      : null,
    height,
    goal ? t('profile.goalKcal', { kcal: formatInt(goal.kcal) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const monthName = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${today}T12:00:00Z`),
  );
  const monthSessions = (month.data ?? []).filter((s) =>
    localDay(new Date(s.startedAt), tz).startsWith(today.slice(0, 7)),
  );
  const trainingDays = new Set(monthSessions.map((s) => localDay(new Date(s.startedAt), tz))).size;
  const daysSoFar = stats.data?.daysSoFar ?? Number(today.slice(8, 10));
  const score = strength.overall;
  const none = t('profile.stats.none');

  const pills: {
    key: string;
    icon: IconName;
    value: string;
    label: string;
    onPress: () => void;
  }[] = [
    {
      key: 'streak',
      icon: 'flame',
      value: stats.data ? formatInt(stats.data.streak) : none,
      label: t('profile.stats.dayStreak'),
      onPress: () => router.push('/calendar'),
    },
    {
      key: 'workouts',
      icon: 'dumbbell',
      value: month.data ? formatInt(monthSessions.length) : none,
      label: t('profile.stats.workouts', { month: monthName }),
      onPress: () => router.push('/train/history'),
    },
    {
      key: 'strength',
      icon: 'chart',
      value: score == null ? none : `${score > 0 ? '+' : ''}${score}%`,
      label: t('profile.stats.strength'),
      onPress: () => router.push('/progress/strength'),
    },
  ];

  const rings: {
    key: string;
    icon: IconName;
    value: string;
    label: string;
    share: number;
    a11y: string;
  }[] = [
    {
      key: 'logged',
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
            icon="settings"
            look="outline"
            accessibilityLabel={t('profile.settings')}
            onPress={() => router.push('/profile/settings')}
          />
        }
      />

      <View style={{ alignItems: 'center', gap: 6 }}>
        <View
          aria-hidden
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: colors.borderDecorative,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="displayM">{initials}</Text>
        </View>
        <Text
          variant="screenTitle"
          accessibilityRole="header"
          numberOfLines={2}
          style={{ textAlign: 'center', marginTop: 4 }}
        >
          {name}
        </Text>
        {subtitle ? (
          <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {pills.map((s) => (
          <Card
            key={s.key}
            size="small"
            gap={2}
            onPress={() => {
              tick();
              s.onPress();
            }}
            accessibilityLabel={`${s.value} ${s.label}`}
            style={{ flex: 1, flexBasis: 0, paddingVertical: 10, paddingHorizontal: 12 }}
          >
            <Icon name={s.icon} size={18} color={colors.text} />
            <Text variant="displayS" numeric numberOfLines={1}>
              {s.value}
            </Text>
            <Text variant="bodyS" muted numberOfLines={2}>
              {s.label}
            </Text>
          </Card>
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
        {rings.map((r) => (
          <Card
            key={r.key}
            gap={10}
            style={{
              flex: 1,
              flexBasis: 0,
              padding: 12,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Gauge value={r.share} size={48} stroke={5} accessibilityLabel={r.a11y}>
              <Icon name={r.icon} size={20} color={colors.text} />
            </Gauge>
            <View style={{ flex: 1, minWidth: 0 }} aria-hidden>
              <Text variant="displayS" numeric numberOfLines={1}>
                {r.value}
              </Text>
              <Text variant="bodyS" muted>
                {r.label}
              </Text>
            </View>
          </Card>
        ))}
      </View>

      <MenuList
        items={[
          {
            icon: 'chart',
            label: t('profile.links.progress'),
            onPress: () => router.push('/progress'),
          },
          {
            icon: 'clock',
            label: t('profile.links.history'),
            onPress: () => router.push('/train/history'),
          },
          {
            icon: 'flame',
            label: t('profile.links.goals'),
            value: goal ? t('profile.goalKcal', { kcal: formatInt(goal.kcal) }) : undefined,
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
