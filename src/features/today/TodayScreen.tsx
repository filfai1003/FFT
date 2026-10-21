import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { longDateLabel, shortDateLabel, weekOf } from '@/domain/day';
import { DayMarkLegend, DayStrip } from '@/components/ui/DayStrip';
import { PageHeader } from '@/components/ui/PageHeader';
import { DayCalendarSheet } from '@/features/progress/calendar-data';
import { useStripStatuses } from '@/features/diet/week-status';
import { AI_DOCK_CLEARANCE, AiDock } from '@/features/ai/AiDock';
import { Card } from '@/components/ui/Card';
import { cleanLook } from '@/domain/community-look';
import { useCommunityMe } from '@/features/community/api';
import { MemberAvatar } from '@/features/community/MemberAvatar';
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
import { DaySummaryLine, Greeting } from './DayOverview';
import { useHomeLayout, type WidgetItem } from './layout-store';
import { dockHiddenAfterScroll } from './dock-scroll';
import { useHint, useHintsStore } from './hints-store';
import { TodayGrid } from './TodayGrid';
import { HomeDayContext } from './home-day';
import { widgetComponents } from './Widgets';

const EDIT_BAR_PADDING = 12;

const EDIT_BAR_HEIGHT = touch.primaryButtonHeight + EDIT_BAR_PADDING * 2;

/** Where a day ring goes when its card is hidden. */

/** Initials for the profile button ("Filippo Faiella" -> "FF"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/**
 * Shown once per device until "Got it": what the two header icons do and what the week strip's
 * marks mean, so the header itself stays clean.
 */
function TodayTips({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const row = (icon: 'sliders' | 'sparkle', label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.borderDecorative,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={16} color={colors.text} />
      </View>
      <Text variant="bodyS" style={{ flex: 1 }}>
        {label}
      </Text>
    </View>
  );
  return (
    <Card gap={10} style={{ padding: 14 }}>
      <Text semibold accessibilityRole="header">
        {t('today.tipsTitle')}
      </Text>
      {row('sliders', t('today.tipEdit'))}
      {row('sparkle', t('today.tipCoach'))}
      <Text variant="bodyS">{t('today.tipWeek')}</Text>
      <DayMarkLegend />
      <Button
        label={t('today.tipsDone')}
        variant="secondary"
        size="small"
        block={false}
        onPress={onDismiss}
        style={{ alignSelf: 'flex-start' }}
      />
    </Card>
  );
}

/** Home: calories on top, then the widgets you chose (workout, water, weight, supplements). */
export function TodayScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const profile = useProfile();
  const member = useCommunityMe();
  const look = cleanLook(member.data?.look);
  const saved = useHomeLayout();
  const { loaded, load } = saved;
  const draft = useTodayEdit((s) => s.draft);
  const editing = draft != null;
  // While editing, the page shows the draft; Done saves it.
  const { widgets, aiDock } = draft ?? saved;
  const userId = useSessionStore((s) => s.userId);
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const tips = useHint('todayTips');
  const dismissHint = useHintsStore((s) => s.dismiss);
  // The day the page shows (DECISIONS 123): null = today; a past day picked on the row or in
  // the calendar shows what was logged that day.
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && picked < today ? picked : today;
  const past = day < today;
  const [calendar, setCalendar] = useState(false);
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const week = weekOf(day, weekStart);
  const marks = useStripStatuses(week, today);
  const pick = (d: string) => setPicked(d >= today ? null : d);
  // The coach bar steps aside while scrolling down, comes back on the way up.
  const [dockHidden, setDockHidden] = useState(false);
  const lastY = useRef(0);

  const enterEdit = () => {
    tick();
    // Edit mode arranges the cards of today.
    setPicked(null);
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
        // The coach bar floats over the page: the last card scrolls clear of it (and its shadow).
        bottomBarHeight={editing ? EDIT_BAR_HEIGHT + 16 : aiDock ? AI_DOCK_CLEARANCE : 24}
        gap={14}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const y = contentOffset.y;
          const toEnd = contentSize.height - layoutMeasurement.height - y;
          const next = dockHiddenAfterScroll(lastY.current, y, dockHidden, toEnd);
          lastY.current = y;
          if (next !== dockHidden) setDockHidden(next);
        }}
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
          <PageHeader
            leading={
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
                {look ? (
                  // The community look (DECISIONS 119): the photo or colour others see.
                  <MemberAvatar name={profile.data?.name ?? '?'} look={look} size={44} />
                ) : initials(profile.data?.name) ? (
                  <Text variant="body" medium>
                    {initials(profile.data?.name)}
                  </Text>
                ) : (
                  <Icon name="user" size={22} color={colors.text} />
                )}
              </Pressable>
            }
            overline={past ? t('days.lookingBack') : shortDateLabel(today)}
            titleNode={
              past ? (
                <Text
                  variant="screenTitle"
                  accessibilityRole="header"
                  accessibilityLabel={longDateLabel(day)}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{ fontSize: 24, lineHeight: 28 }}
                >
                  {shortDateLabel(day)}
                </Text>
              ) : (
                <Greeting name={profile.data?.name} />
              )
            }
            actions={
              <>
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
              </>
            }
            onCalendar={() => setCalendar(true)}
          />
        )}

        {/* The summary line belongs to the greeting: closer to it than the page gap. */}
        {editing || past ? null : <DaySummaryLine style={{ marginTop: -8 }} />}
        {/* The shared row of days: a tap shows that day here (DECISIONS 123). */}
        {editing ? null : (
          <DayStrip days={week} selected={day} today={today} onSelect={pick} marks={marks} />
        )}
        {!editing && tips ? <TodayTips onDismiss={() => dismissHint('todayTips')} /> : null}
        {editing ? null : <ActiveSessionBanner />}

        <HomeDayContext.Provider value={past ? day : null}>
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
        </HomeDayContext.Provider>
      </Screen>
      <DayCalendarSheet
        visible={calendar}
        onClose={() => setCalendar(false)}
        selected={day}
        onSelect={pick}
      />

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
        <AiDock hidden={dockHidden} />
      ) : null}
    </>
  );
}
