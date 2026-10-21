import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { useTheme } from '@/design/use-theme';
import {
  formatClock,
  MAX_PER_DAY_LIMITS,
  nextMealTime,
  useReminderTimes,
  type Clock,
  type ReminderTimes,
} from '@/lib/reminder-times';
import { usePreferencesStore } from './preferences-store';
import { useReminder, type ReminderSetting } from './use-reminder';

// The system numbers weekdays 1 = Sunday … 7 = Saturday; the chips start on Monday.
const WEEK_ORDER = [2, 3, 4, 5, 6, 7, 1] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** Hours and minutes with − / + (minutes in steps of 5). */
function ClockEditor({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: Clock;
  onChange: (next: Clock) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <Text variant="bodyS" muted>
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Stepper
            value={value.hour}
            min={0}
            max={23}
            format={pad}
            valueLabel={t('reminders.hour')}
            decreaseLabel={t('reminders.hourLess')}
            increaseLabel={t('reminders.hourMore')}
            onChange={(hour) => onChange({ ...value, hour })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Stepper
            value={value.minute}
            min={0}
            max={55}
            step={5}
            format={pad}
            valueLabel={t('reminders.minute')}
            decreaseLabel={t('reminders.minuteLess')}
            increaseLabel={t('reminders.minuteMore')}
            onChange={(minute) => onChange({ ...value, minute })}
          />
        </View>
      </View>
    </View>
  );
}

/** The last day of the week in the system's numbering (1 = Sunday … 7 = Saturday). */
export const lastWeekday = (weekStart: 'mon' | 'sun') => (weekStart === 'mon' ? 1 : 7);

/** What the reminder says about when it goes off ("On your usual training days at 18:00"). */
export function reminderSummary(
  kind: ReminderSetting,
  times: ReminderTimes,
  t: (key: string, options?: Record<string, unknown>) => string,
  weekStart: 'mon' | 'sun' = 'mon',
): string {
  if (kind === 'workout') return t('reminders.usualDaysAt', { time: formatClock(times.workout) });
  if (kind === 'water') return t('reminders.waterAt', { time: formatClock(times.water) });
  if (kind === 'weekly')
    return t('reminders.weeklyAt', {
      day: t(`reminders.weekday.${lastWeekday(weekStart)}`),
      time: formatClock(times.weekly),
    });
  if (kind === 'checkin')
    return t('reminders.weeklyAt', {
      day: t(`reminders.weekday.${times.checkin.weekday}`),
      time: formatClock(times.checkin),
    });
  if (times.meals.length === 0) return t('reminders.noMealTimesShort');
  return t('reminders.ifNotLogged', {
    times: [...times.meals]
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
      .map(formatClock)
      .join(' · '),
  });
}

const nameKey = {
  workout: 'workout_reminder',
  checkin: 'weekly_check_in',
  meals: 'meals',
  water: 'water',
  weekly: 'weekly_summary',
} as const satisfies Record<ReminderSetting, string>;

/**
 * A reminder in the Reminders settings: the switch, when it goes off, and a way to change the
 * time. Workout, meals, water and the weekly summary are smart (DECISIONS 122).
 */
export function ReminderRow({ kind, bare = false }: { kind: ReminderSetting; bare?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { enabled, times, toggle, changeTimes } = useReminder(kind);
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const [editing, setEditing] = useState(false);
  const [denied, setDenied] = useState(false);
  const name = t(`settings.notification.${nameKey[kind]}.name`);
  const summary = reminderSummary(kind, times, t as never, weekStart);
  const help = (text: string) => (
    <Text variant="bodyS" muted>
      {text}
    </Text>
  );

  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${summary}. ${t('reminders.changeTime')}`}
        onPress={() => setEditing(true)}
        style={{ flex: 1, gap: 2, justifyContent: 'center', minHeight: 52 }}
      >
        <Text variant="bodyS" medium>
          {name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="bodyS" muted style={{ flexShrink: 1 }}>
            {summary}
          </Text>
          <Icon name="edit" size={14} color={colors.textMuted} />
        </View>
      </Pressable>
      <Toggle
        value={enabled}
        onValueChange={(value) => void toggle(value).then((r) => r === 'denied' && setDenied(true))}
        accessibilityLabel={name}
      />
    </View>
  );

  return (
    <>
      {bare ? body : <Card size="small">{body}</Card>}

      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title={name}
        closeLabel={t('common.close')}
      >
        {kind === 'workout' ? (
          <>
            {help(t('reminders.workoutHelp'))}
            <ClockEditor
              value={times.workout}
              onChange={(workout) => void changeTimes({ workout })}
            />
          </>
        ) : null}
        {kind === 'water' ? (
          <>
            {help(t('reminders.waterHelp'))}
            <ClockEditor value={times.water} onChange={(water) => void changeTimes({ water })} />
          </>
        ) : null}
        {kind === 'weekly' ? (
          <>
            {help(
              t('reminders.weeklyHelp', {
                day: t(`reminders.weekday.${lastWeekday(weekStart)}`),
              }),
            )}
            <ClockEditor
              value={times.weekly}
              onChange={(weekly) => void changeTimes({ weekly })}
            />
          </>
        ) : null}
        {kind === 'checkin' ? (
          <>
            <ChipGroup
              legend={t('reminders.day')}
              value={String(times.checkin.weekday)}
              onChange={(v) =>
                void changeTimes({ checkin: { ...times.checkin, weekday: Number(v) } })
              }
              options={WEEK_ORDER.map((d) => ({
                value: String(d),
                label: t(`reminders.weekdayShort.${d}`),
              }))}
            />
            <ClockEditor
              value={times.checkin}
              onChange={(c) => void changeTimes({ checkin: { ...times.checkin, ...c } })}
            />
          </>
        ) : null}
        {kind === 'meals' ? (
          <>
            {help(t('reminders.mealsHelp'))}
            {times.meals.length === 0 ? (
              <Text variant="bodyS" muted>
                {t('reminders.noMealTimes')}
              </Text>
            ) : null}
            {times.meals.map((meal, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <ClockEditor
                    label={t('reminders.mealTime', { n: i + 1 })}
                    value={meal}
                    onChange={(next) => {
                      const meals = [...times.meals];
                      meals[i] = next;
                      void changeTimes({ meals });
                    }}
                  />
                </View>
                <IconButton
                  icon="trash"
                  accessibilityLabel={t('reminders.removeMealTime', { n: i + 1 })}
                  onPress={() => void changeTimes({ meals: times.meals.filter((_, j) => j !== i) })}
                />
              </View>
            ))}
            <Button
              variant="secondary"
              label={t('reminders.addMealTime')}
              onPress={() =>
                void changeTimes({ meals: [...times.meals, nextMealTime(times.meals)] })
              }
            />
          </>
        ) : null}
      </Sheet>

      <Sheet
        visible={denied}
        onClose={() => setDenied(false)}
        title={t('settings.deniedTitle')}
        closeLabel={t('common.close')}
      >
        <Text muted>{t('settings.deniedBody')}</Text>
        <Button
          label={t('settings.openDeviceSettings')}
          onPress={() => {
            setDenied(false);
            void Linking.openSettings();
          }}
        />
      </Sheet>
    </>
  );
}

/**
 * Quiet hours and the daily cap of the smart reminders (DECISIONS 122): one row, a sheet to change
 * them. Local to this phone, like the times.
 */
export function ReminderLimitsRow() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { times, loaded, load, set } = useReminderTimes();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const { quiet, maxPerDay } = times;
  const name = t('reminders.limits');
  const summary = [
    quiet.on
      ? t('reminders.quietSummary', { start: formatClock(quiet.start), end: formatClock(quiet.end) })
      : t('reminders.quietOff'),
    t('reminders.perDay', { count: maxPerDay }),
  ].join(' · ');

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${summary}. ${t('reminders.changeLimits')}`}
        onPress={() => setEditing(true)}
        style={{ gap: 2, justifyContent: 'center', minHeight: 56 }}
      >
        <Text variant="bodyS" medium>
          {name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="bodyS" muted style={{ flexShrink: 1 }}>
            {summary}
          </Text>
          <Icon name="edit" size={14} color={colors.textMuted} />
        </View>
      </Pressable>
      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title={name}
        closeLabel={t('common.close')}
      >
        <Text variant="bodyS" muted>
          {t('reminders.limitsHelp')}
        </Text>
        <ToggleRow
          name={t('reminders.quietHours')}
          detail={t('reminders.quietHelp')}
          value={quiet.on}
          onValueChange={(on) => set({ quiet: { ...quiet, on } })}
        />
        {quiet.on ? (
          <>
            <ClockEditor
              label={t('reminders.quietStart')}
              value={quiet.start}
              onChange={(start) => set({ quiet: { ...quiet, start } })}
            />
            <ClockEditor
              label={t('reminders.quietEnd')}
              value={quiet.end}
              onChange={(end) => set({ quiet: { ...quiet, end } })}
            />
          </>
        ) : null}
        <View style={{ gap: 8 }}>
          <Text variant="bodyS" muted>
            {t('reminders.maxPerDay')}
          </Text>
          <Stepper
            value={maxPerDay}
            min={MAX_PER_DAY_LIMITS.min}
            max={MAX_PER_DAY_LIMITS.max}
            valueLabel={t('reminders.maxPerDay')}
            decreaseLabel={t('reminders.fewer')}
            increaseLabel={t('reminders.more')}
            onChange={(n) => set({ maxPerDay: n })}
          />
        </View>
      </Sheet>
    </>
  );
}
