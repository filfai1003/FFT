import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { dayOfMonth, shortDateLabel, weekOf, weekdayLetter } from '@/domain/day';
import { AI_DOCK_HEIGHT, AiDock } from '@/features/ai/AiDock';
import { useCalendarData } from '@/features/progress/CalendarGrid';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { ActiveSessionBanner } from '@/features/session/ActiveSessionBanner';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { Reveal } from '@/components/ui/motion';
import { tick } from '@/lib/haptics';
import { CustomizeSheet } from './CustomizeSheet';
import { useSessionStore } from '@/features/auth/session-store';
import { supplementKeys } from '@/features/supplements/data';
import { migrateCreatineDays } from '@/features/supplements/migrate-creatine';
import { useHomeLayout } from './layout-store';
import { widgetComponents } from './Widgets';

const WIDGET_GAP = 10;

/** Initials for the profile button ("Filippo Faiella" -> "FF"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** This week at a glance: a dot under each day says if the diet was on target. Opens the calendar. */
function WeekStrip() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const days = weekOf(today, weekStart);
  const data = useCalendarData([days[0]!.slice(0, 7), days[6]!.slice(0, 7)]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('calendar.open')}
      onPress={() => {
        tick();
        router.push('/calendar');
      }}
      style={{ flexDirection: 'row', gap: 4 }}
    >
      {days.map((d) => {
        const isToday = d === today;
        const status = d <= today ? data.statusOf(d) : 'none';
        const dot =
          status === 'onTarget'
            ? colors.success
            : status === 'off'
              ? colors.warning
              : 'transparent';
        return (
          <View
            key={d}
            style={{
              flex: 1,
              alignItems: 'center',
              gap: 3,
              paddingVertical: 6,
              borderRadius: 12,
              backgroundColor: isToday ? colors.text : 'transparent',
            }}
          >
            <Text variant="label" style={{ color: isToday ? colors.bg : colors.textMuted }}>
              {weekdayLetter(d)}
            </Text>
            <Text
              variant="body"
              numeric
              style={{ fontWeight: '600', fontSize: 16, color: isToday ? colors.bg : colors.text }}
            >
              {dayOfMonth(d)}
            </Text>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: isToday && dot === 'transparent' ? colors.bg : dot,
              }}
            />
          </View>
        );
      })}
    </Pressable>
  );
}

/** Home: calories on top, then the widgets you chose (workout, water, weight, supplements). */
export function TodayScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const profile = useProfile();
  const { widgets, aiDock, loaded, load } = useHomeLayout();
  const userId = useSessionStore((s) => s.userId);
  const queryClient = useQueryClient();
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  // The old Creatine widget's days become ticks of the Supplements list (once).
  useEffect(() => {
    if (!userId) return;
    void migrateCreatineDays(userId).then((moved) => {
      if (moved) void queryClient.invalidateQueries({ queryKey: supplementKeys.all });
    });
  }, [userId, queryClient]);

  const [width, setWidth] = useState(0);
  // Two small widgets side by side leave the same gap as the rows above and below.
  const half = width > 0 ? (width - WIDGET_GAP) / 2 : '48%';
  const shown = widgets.filter((w) => w.visible);

  return (
    <>
      <Screen
        scroll
        keyboardAware={false}
        bottomBarHeight={aiDock ? AI_DOCK_HEIGHT + 8 : 24}
        gap={14}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('nav.profile')}
            onPress={() => {
              tick();
              router.push('/profile');
            }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.dotOff,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initials(profile.data?.name) ? (
              <Text variant="body" medium>
                {initials(profile.data?.name)}
              </Text>
            ) : (
              <Icon name="user" size={22} color={colors.text} />
            )}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="bodyS" muted>
              {shortDateLabel(today)}
            </Text>
            <Text variant="screenTitle" style={{ fontSize: 24, lineHeight: 28 }}>
              {t('today.title')}
            </Text>
          </View>
          <IconButton
            icon="sliders"
            accessibilityLabel={t('today.customize')}
            onPress={() => setCustomizing(true)}
          />
          <IconButton
            icon="sparkle"
            accessibilityLabel={t('ai.chatScreenTitle')}
            onPress={() => router.push('/ai-chat')}
          />
        </View>

        <WeekStrip />
        <ActiveSessionBanner />

        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: WIDGET_GAP }}
        >
          {shown.map((w, n) => {
            const Widget = widgetComponents[w.id];
            return (
              <View
                key={w.id}
                style={{ width: w.size === 'large' ? '100%' : half, flexDirection: 'column' }}
              >
                <Reveal index={n} style={{ flexGrow: 1 }}>
                  <Widget size={w.size} />
                </Reveal>
              </View>
            );
          })}
        </View>
        {shown.length === 0 ? <Text muted>{t('today.empty')}</Text> : null}
      </Screen>

      {aiDock ? <AiDock /> : null}
      <CustomizeSheet visible={customizing} onClose={() => setCustomizing(false)} />
    </>
  );
}
