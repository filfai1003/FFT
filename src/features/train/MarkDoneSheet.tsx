import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { shortDateLabel } from '@/domain/day';
import { useToastStore } from '@/lib/toast-store';
import { useMarkWorkoutDone, useSetWorkoutDeleted } from './mark-done';
import { useActivePlan, useRotation } from './plans';

/**
 * "Done on Wed 14 Oct": pick which plan day (or another workout) was trained on a past day.
 * Shared by the Progress calendar's day detail and Today on a past day (DECISIONS 123).
 */
export function MarkDoneSheet({
  visible,
  onClose,
  day,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
}) {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const { plan } = useActivePlan();
  const rotation = useRotation(plan);
  const markDone = useMarkWorkoutDone();
  const setWorkoutDeleted = useSetWorkoutDeleted();

  const mark = async (name: string, planDayId: string | null) => {
    onClose();
    const planDay = plan?.days.find((d) => d.id === planDayId) ?? null;
    const id = await markDone.mutateAsync({
      day,
      name,
      plan: planDay ? plan : null,
      planDay,
      rotation,
    });
    showToast({
      message: t('calendar.markedDone', { name }),
      actionLabel: t('common.undo'),
      onAction: () => setWorkoutDeleted.mutate({ id, deleted: true }),
    });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('calendar.markDoneTitle', { date: shortDateLabel(day) })}
      closeLabel={t('common.close')}
    >
      <View style={{ gap: 8 }}>
        {(plan?.days ?? []).map((d) => (
          <Button
            key={d.id}
            variant={rotation?.state.upNextDayId === d.id ? 'primary' : 'secondary'}
            label={d.name}
            disabled={markDone.isPending}
            onPress={() => void mark(d.name, d.id)}
          />
        ))}
        <Button
          variant="ghost"
          label={t('calendar.otherWorkout')}
          disabled={markDone.isPending}
          onPress={() => void mark(t('calendar.otherWorkout'), null)}
        />
      </View>
    </Sheet>
  );
}
