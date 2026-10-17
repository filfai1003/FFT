import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
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
import { useSessionStore } from '@/features/auth/session-store';
import { useBlockTabSwipe } from '@/features/navigation/swipe-lock';
import { supplementKeys } from '@/features/supplements/data';
import { migrateCreatineDays } from '@/features/supplements/migrate-creatine';
import { space, touch } from '@/design/tokens';
import { useToastStore } from '@/lib/toast-store';
import {
  changeTodayDraft,
  finishTodayEdit,
  restoreTodayLayout,
  startTodayEdit,
  useTodayEdit,
} from './edit-store';
import { useHomeLayout, type WidgetItem } from './layout-store';
import { TodayGrid } from './TodayGrid';
import { widgetComponents } from './Widgets';

const EDIT_BAR_PADDING = 12;
const EDIT_BAR_HEIGHT = touch.primaryButtonHeight + EDIT_BAR_PADDING * 2;

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
  const saved = useHomeLayout();
  const { loaded, load } = saved;
  const draft = useTodayEdit((s) => s.draft);
  const editing = draft != null;
  // While editing, the page shows the draft; Done saves it.
  const { widgets, aiDock } = draft ?? saved;
  const userId = useSessionStore((s) => s.userId);
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);

  const enterEdit = () => {
    tick();
    startTodayEdit();
  };
  const done = () => {
    const before = finishTodayEdit();
    tick();
    if (before)
      showToast({
        message: t('today.layoutSaved'),
        actionLabel: t('common.undo'),
        onAction: () => restoreTodayLayout(before),
      });
  };

  // Cards are dragged in edit mode: no swipe to the next tab meanwhile.
  useBlockTabSwipe('today-edit', editing);
  // Back (Android) and leaving the page end edit mode the same way as Done.
  useEffect(() => {
    if (!editing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      done();
      return true;
    });
    return () => sub.remove();
  });
  useFocusEffect(
    useCallback(
      () => () => {
        if (useTodayEdit.getState().draft) finishTodayEdit();
      },
      [],
    ),
  );

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

  const change = (next: readonly WidgetItem[]) =>
    changeTodayDraft((d) => ({ ...d, widgets: next }));

  return (
    <>
      <Screen
        scroll
        keyboardAware={false}
        bottomBarHeight={editing ? EDIT_BAR_HEIGHT + 16 : aiDock ? AI_DOCK_HEIGHT + 8 : 24}
        gap={14}
      >
        {editing ? (
          <View style={{ gap: 2, minHeight: 44, justifyContent: 'center' }}>
            <Text variant="screenTitle" style={{ fontSize: 24, lineHeight: 28 }}>
              {t('today.editTitle')}
            </Text>
            <Text variant="bodyS" muted>
              {t('today.editInfo')}
            </Text>
          </View>
        ) : (
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
            {/* Where "Customize" was: the way into edit mode (also: hold any card). */}
            <IconButton
              icon="sliders"
              accessibilityLabel={t('today.editLabel')}
              onPress={enterEdit}
            />
            <IconButton
              icon="sparkle"
              accessibilityLabel={t('ai.chatScreenTitle')}
              onPress={() => router.push('/ai-chat')}
            />
          </View>
        )}

        {editing ? null : <WeekStrip />}
        {editing ? null : <ActiveSessionBanner />}

        <TodayGrid
          widgets={widgets}
          editing={editing}
          onEnterEdit={enterEdit}
          onChange={change}
          aiDock={aiDock}
          onAiDock={(visible) => changeTodayDraft((d) => ({ ...d, aiDock: visible }))}
          renderWidget={(w, n) => {
            const Widget = widgetComponents[w.id];
            return (
              <Reveal index={n} style={{ flexGrow: 1 }}>
                <Widget size={w.size} />
              </Reveal>
            );
          }}
        />
      </Screen>

      {editing ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: space.screenX,
            paddingVertical: EDIT_BAR_PADDING,
            borderTopWidth: 1,
            borderTopColor: colors.borderDecorative,
            backgroundColor: colors.bg,
          }}
        >
          <Button label={t('today.done')} size="large" icon="check" onPress={done} />
        </View>
      ) : aiDock ? (
        <AiDock />
      ) : null}
    </>
  );
}
