import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Gauge } from '@/components/ui/Gauge';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { nextStreakTarget, streakWeek } from '@/domain/gamification';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import type { WidgetSize } from '@/features/today/layout-store';
import { WeekDayMark } from './components';
import { useGamification } from './data';

/**
 * Home card (canvas Home): the streak in orange with this week's days (the next badge lives on
 * Progress, DECISIONS 107). A Today card
 * like the others: edit mode can move, resize or hide it.
 */
export function StreakWidget({ size }: { size: WidgetSize }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const game = useGamification();
  const streak = game?.streak ?? 0;
  const target = nextStreakTarget(streak);
  const week = game ? streakWeek(game.activity.loggedDays, today, weekStart) : [];
  const logged = week.filter((d) => d.state === 'done').length;
  const todayOpen = week.some((d) => d.state === 'today');
  // Day 0 is an invitation, not a "0-day streak".
  const streakTitle = streak > 0 ? t('game.streakWord', { count: streak }) : t('game.startStreak');
  const ring = (
    <Gauge
      value={target ? streak / target : 1}
      size={52}
      stroke={5}
      color={colors.streak}
      track={colors.streakSoft}
      accessibilityLabel={
        target
          ? t('game.streakA11y', { count: streak, target })
          : t('game.streakA11yNoTarget', { count: streak })
      }
    >
      <Icon name="flame" size={22} color={colors.streakInk} />
    </Gauge>
  );
  const title = (
    // Half width: "12 days" wraps next to the ring rather than being cut.
    <Text variant="displayS" numberOfLines={size === 'small' ? 2 : 1}>
      {streakTitle}
    </Text>
  );

  return (
    <Card
      onPress={() => router.navigate('/progress')}
      accessibilityLabel={`${streakTitle}. ${t('today.widget.streak')}`}
      gap={12}
      size={size === 'small' ? 'small' : 'default'}
      style={{
        flexGrow: 1,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: size === 'large' ? 'row' : 'column',
        alignItems: size === 'large' ? 'center' : 'flex-start',
      }}
    >
      {size === 'large' ? (
        <>
          {ring}
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            {title}
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={
                todayOpen
                  ? t('game.weekA11yToday', { count: logged, total: 7 })
                  : t('game.weekA11y', { count: logged, total: 7 })
              }
              style={{ flexDirection: 'row', gap: 4 }}
            >
              {week.map((d) => (
                <WeekDayMark key={d.day} state={d.state} size={14} withIcon={false} />
              ))}
            </View>
            <Text variant="label" muted>
              {todayOpen ? t('game.logToday') : t('game.loggedToday')}
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {ring}
            <View style={{ flex: 1, minWidth: 0 }}>{title}</View>
          </View>
          <Text variant="label" muted numberOfLines={2}>
            {todayOpen ? t('game.logToday') : t('game.loggedToday')}
          </Text>
        </>
      )}
    </Card>
  );
}
