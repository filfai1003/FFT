import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MonthGrid, MonthSwitcher } from '@/components/ui/MonthGrid';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { SkeletonGroup, SkeletonRows } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import {
  dayOfMonth,
  deviceTimeZone,
  localDay,
  monthGrid,
  shortDateLabel,
  weekdayName,
} from '@/domain/day';
import { displayWeight } from '@/domain/units';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useCalendarMarks } from '@/features/progress/calendar-data';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useMonthSessions, type SessionView } from './history';
import { goBack } from '@/lib/navigation';

/**
 * Training history: the month in the shared month grid (DECISIONS 123: the same day cells as the
 * calendar, a purple dot under a trained day) and its sessions. A tap on a day shows that day's
 * sessions only ("Whole month" brings the month back).
 */
export function HistoryScreen({
  sessionRoute,
}: {
  sessionRoute: '/train/history/[sessionId]' | '/progress/history/[sessionId]';
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const unit = usePreferencesStore((s) => s.weightUnit);
  const tz = useProfile().data?.timezone ?? deviceTimeZone();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const sessions = useMonthSessions(ym);

  const inMonth = (sessions.data ?? []).filter(
    (s) => localDay(new Date(s.startedAt), tz).slice(0, 7) === ym,
  );
  const sessionsByDay = new Map<string, SessionView[]>();
  for (const s of inMonth) {
    const d = localDay(new Date(s.startedAt), tz);
    sessionsByDay.set(d, [...(sessionsByDay.get(d) ?? []), s]);
  }
  const marks = useCalendarMarks(
    { sessionsByDay, statusOf: () => 'none', supplementsOf: () => 'none' },
    'training',
  );
  const shown = day ? (sessionsByDay.get(day) ?? []) : inMonth;

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar
        onBack={() => goBack(router, sessionRoute.startsWith('/progress') ? '/progress' : '/train')}
        backLabel={t('common.back')}
      />
      <Text variant="screenTitle" accessibilityRole="header">
        {t('history.title')}
      </Text>

      <Card size="small" gap={10}>
        <MonthSwitcher
          month={ym}
          today={today}
          onChange={(m) => {
            setYm(m);
            setDay(null);
          }}
        >
          <Text variant="bodyS" muted>
            {t('history.workouts', { count: inMonth.length })}
          </Text>
        </MonthSwitcher>
        <MonthGrid
          cells={monthGrid(ym, weekStart)}
          weekStart={weekStart}
          today={today}
          selected={day}
          onSelect={(d) => setDay(d === day ? null : d)}
          renderMarks={marks.renderMarks}
          describe={marks.describe}
        />
      </Card>

      <Section title={day ? shortDateLabel(day) : t('history.sessions')}>
        {day ? (
          <Button
            variant="secondary"
            size="small"
            block={false}
            label={t('history.wholeMonth')}
            onPress={() => setDay(null)}
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}
        {sessions.isPending ? (
          <SkeletonGroup accessibilityLabel={t('common.loading')}>
            <SkeletonRows count={3} leading={false} />
          </SkeletonGroup>
        ) : shown.length === 0 ? (
          <EmptyState
            compact
            icon="clock"
            area="training"
            title={day ? t('history.dayEmpty') : t('empty.historyTitle')}
            body={t('empty.historyBody')}
          />
        ) : (
          shown.map((s) => (
            <SessionRow
              key={s.id}
              s={s}
              tz={tz}
              unitLabel={unit}
              onPress={() => router.push({ pathname: sessionRoute, params: { sessionId: s.id } })}
            />
          ))
        )}
      </Section>
    </Screen>
  );
}

function SessionRow({
  s,
  tz,
  unitLabel,
  onPress,
}: {
  s: SessionView;
  tz: string;
  unitLabel: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const day = localDay(new Date(s.startedAt), tz);
  const unit = unitLabel as 'kg' | 'lb';
  const tonnes = displayWeight(s.stats.volumeKg, unit) / 1000;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${s.name} ${weekdayName(day)} ${dayOfMonth(day)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderBottomWidth: 1,
        borderColor: colors.borderDecorative,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 36, alignItems: 'center' }}>
        <Text variant="bodyS" muted>
          {weekdayName(day).slice(0, 3)}
        </Text>
        <Text variant="displayS" numeric>
          {String(dayOfMonth(day)).padStart(2, '0')}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text variant="body">{s.name || t('train.emptyWorkout')}</Text>
          {s.outOfOrder ? <StatusChip label={t('history.outOfOrder')} /> : null}
        </View>
        <Text variant="bodyS" muted>
          {t('history.info', {
            min: s.stats.minutes,
            tonnes: tonnes.toFixed(1),
            unit: unit === 'kg' ? 'T' : 'K LB',
            count: s.stats.sets,
          })}
        </Text>
      </View>
    </Pressable>
  );
}
