import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Gauge } from '@/components/ui/Gauge';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { nextBadges, nextStreakTarget, streakWeek } from '@/domain/gamification';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import type { WidgetSize } from '@/features/today/layout-store';
import { WeekDayMark, badgeName } from './components';
import { useGamification } from './data';

/**
 * Home card (canvas Home): streak ring with this week's days, and the next badge. A Today card
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
  const next = game ? nextBadges(game.badges, 1)[0] : undefined;
  const ring = (
    <Gauge
      value={target ? streak / target : 1}
      size={52}
      stroke={5}
      accessibilityLabel={
        target
          ? t('game.streakA11y', { count: streak, target })
          : t('game.streakA11yNoTarget', { count: streak })
      }
    >
      <Icon name="flame" size={22} color={colors.text} />
    </Gauge>
  );
  const title = (
    <Text semibold numberOfLines={1}>
      {t('game.streakWord', { count: streak })}
    </Text>
  );

  return (
    <Card
      onPress={() => router.navigate('/progress')}
      accessibilityLabel={`${t('game.streakWord', { count: streak })}. ${t('today.widget.streak')}`}
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
          {next ? (
            <>
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.divider }} />
              <View style={{ width: 76, alignItems: 'center', gap: 4 }}>
                <Gauge
                  value={next.share}
                  size={40}
                  stroke={4}
                  accessibilityLabel={t('game.nextBadgeA11y', {
                    name: badgeName(t, next.id),
                    current: next.current,
                    target: next.target,
                  })}
                >
                  <Icon name={next.glyph} size={18} color={colors.text} />
                </Gauge>
                <Text
                  variant="label"
                  semibold
                  numberOfLines={2}
                  style={{ textAlign: 'center' }}
                  aria-hidden
                >
                  {badgeName(t, next.id)}
                </Text>
                <Text variant="label" muted numeric aria-hidden>
                  {t('game.ofCount', { current: next.current, target: next.target })}
                </Text>
              </View>
            </>
          ) : null}
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {ring}
            <View style={{ flex: 1, minWidth: 0 }}>{title}</View>
          </View>
          <Text variant="label" muted numberOfLines={2}>
            {next
              ? `${t('game.nextBadge')}: ${badgeName(t, next.id)} · ${t('game.ofCount', {
                  current: next.current,
                  target: next.target,
                })}`
              : todayOpen
                ? t('game.logToday')
                : t('game.loggedToday')}
          </Text>
        </>
      )}
    </Card>
  );
}
