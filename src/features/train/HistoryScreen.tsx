import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import {
  addDays,
  dayOfMonth,
  deviceTimeZone,
  localDay,
  monthYearLabel,
  weekdayName,
} from '@/domain/day';
import { displayWeight } from '@/domain/units';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useMonthSessions, type SessionView } from './history';
import { goBack } from '@/lib/navigation';

/** Days of a month as a grid (Monday or Sunday first), with leading blanks. */
export function monthGrid(ym: string, weekStart: 'mon' | 'sun'): (string | null)[] {
  const first = `${ym}-01`;
  const [y, m] = ym.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const blanks = weekStart === 'mon' ? (dow + 6) % 7 : dow;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [
    ...Array<null>(blanks).fill(null),
    ...Array.from({ length: count }, (_, i) => addDays(first, i)),
  ];
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function HistoryScreen({
  sessionRoute,
}: {
  sessionRoute: '/train/history/[sessionId]' | '/progress/history/[sessionId]';
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const unit = usePreferencesStore((s) => s.weightUnit);
  const tz = useProfile().data?.timezone ?? deviceTimeZone();
  const [ym, setYm] = useState(today.slice(0, 7));
  const sessions = useMonthSessions(ym);

  const inMonth = (sessions.data ?? []).filter(
    (s) => localDay(new Date(s.startedAt), tz).slice(0, 7) === ym,
  );
  const trainedDays = new Set(inMonth.map((s) => localDay(new Date(s.startedAt), tz)));
  const cells = monthGrid(ym, weekStart);
  const letters =
    weekStart === 'mon' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const isCurrent = ym === today.slice(0, 7);

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar
        onBack={() => goBack(router, sessionRoute.startsWith('/progress') ? '/progress' : '/train')}
        backLabel={t('common.back')}
      />
      <Text variant="screenTitle">{t('history.title')}</Text>

      <Card size="small" gap={10}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <IconButton
            icon="chevronLeft"
            accessibilityLabel={t('history.prevMonth')}
            onPress={() => setYm(shiftMonth(ym, -1))}
          />
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="label">{monthYearLabel(`${ym}-01`)}</Text>
            <Text variant="bodyS" muted>
              {t('history.workouts', { count: inMonth.length })}
            </Text>
          </View>
          <IconButton
            icon="chevronRight"
            accessibilityLabel={t('history.nextMonth')}
            disabled={isCurrent}
            onPress={() => setYm(shiftMonth(ym, 1))}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {letters.map((l, i) => (
            <View key={i} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingBottom: 4 }}>
              <Text variant="bodyS" muted>
                {l}
              </Text>
            </View>
          ))}
          {cells.map((day, i) => {
            const trained = day != null && trainedDays.has(day);
            const future = day != null && day > today;
            const isToday = day === today;
            return (
              <View
                key={i}
                accessible={day != null}
                accessibilityLabel={
                  day
                    ? `${dayOfMonth(day)}${trained ? `, ${t('history.trained')}` : ''}`
                    : undefined
                }
                style={{
                  width: `${100 / 7}%`,
                  height: 36,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                }}
              >
                {day ? (
                  <>
                    <Text
                      variant="label"
                      style={{
                        color: future
                          ? colors.textPlaceholderIcon
                          : isToday
                            ? colors.text
                            : colors.textMuted,
                      }}
                    >
                      {dayOfMonth(day)}
                    </Text>
                    <View
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 5,
                        backgroundColor: trained
                          ? colors.dotOn
                          : future
                            ? 'transparent'
                            : colors.dotOff,
                        borderWidth: isToday ? 2 : future ? 1 : 0,
                        borderColor: isToday ? colors.accent : colors.dotOff,
                      }}
                    />
                  </>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>

      <Section title={t('history.sessions')}>
        {inMonth.length === 0 ? (
          <EmptyState
            compact
            icon="clock"
            area="training"
            title={t('empty.historyTitle')}
            body={t('empty.historyBody')}
          />
        ) : (
          inMonth.map((s) => (
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
          {s.outOfOrder ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.textPlaceholderIcon,
              }}
            >
              <Text variant="label">{t('history.outOfOrder')}</Text>
            </View>
          ) : null}
        </View>
        <Text variant="bodyS" muted>
          {t('history.info', {
            min: s.stats.minutes,
            tonnes: tonnes.toFixed(1),
            unit: unit === 'kg' ? 'T' : 'K LB',
            sets: s.stats.sets,
          })}
        </Text>
      </View>
    </Pressable>
  );
}
