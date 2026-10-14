import { useState } from 'react';
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
import { useTheme } from '@/design/use-theme';
import type { ReminderKind } from '@/lib/notifications';
import { formatClock, nextMealTime, type Clock, type ReminderTimes } from '@/lib/reminder-times';
import { useReminder } from './use-reminder';

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
        <Text variant="label" muted>
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

/** What the reminder says about when it goes off ("Every day at 18:00"). */
export function reminderSummary(
  kind: ReminderKind,
  times: ReminderTimes,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (kind === 'workout') return t('reminders.dailyAt', { time: formatClock(times.workout) });
  if (kind === 'checkin')
    return t('reminders.weeklyAt', {
      day: t(`reminders.weekday.${times.checkin.weekday}`),
      time: formatClock(times.checkin),
    });
  if (times.meals.length === 0) return t('reminders.noMealTimesShort');
  return [...times.meals]
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
    .map(formatClock)
    .join(' · ');
}

/**
 * A reminder where it belongs: the switch, when it goes off, and a way to change the time. Used in
 * Train (workout), Diet (meals), Progress (weekly check-in) and in Settings.
 */
export function ReminderRow({ kind, bare = false }: { kind: ReminderKind; bare?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { enabled, times, toggle, changeTimes } = useReminder(kind);
  const [editing, setEditing] = useState(false);
  const [denied, setDenied] = useState(false);
  const name = t(
    `settings.notification.${kind === 'workout' ? 'workout_reminder' : kind === 'checkin' ? 'weekly_check_in' : 'meals'}.name`,
  );
  const summary = reminderSummary(kind, times, t as never);

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
          <Text variant="label" muted style={{ flexShrink: 1 }}>
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
          <ClockEditor
            value={times.workout}
            onChange={(workout) => void changeTimes({ workout })}
          />
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
