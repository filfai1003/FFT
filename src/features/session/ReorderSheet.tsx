import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { DragHandle, moveActionDelta, useReorder } from '@/components/ui/reorder';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { exerciseState, moveExercise } from './logic';
import { useSessionStore } from './store';

/** The workout's exercises in order: hold a row and slide it to change the order. */
export function ReorderSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const exercises = useSessionStore((s) => s.active?.exercises ?? []);
  const update = useSessionStore((s) => s.update);
  const move = (from: number, to: number) => update((s) => moveExercise(s, from, to));
  const reorder = useReorder(
    exercises.map((e) => e.rowId),
    move,
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('session.reorder')}
      closeLabel={t('common.close')}
    >
      <Text variant="bodyS" muted>
        {t('session.reorderHint')}
      </Text>
      <View>
        {exercises.map((e, i) => {
          const row = reorder.rowProps(i);
          const state = exerciseState(e);
          return (
            <View
              key={e.rowId}
              onLayout={row.onLayout}
              style={[
                {
                  borderTopWidth: 1,
                  borderColor: colors.borderDecorative,
                  backgroundColor: colors.surface,
                },
                row.style,
              ]}
            >
              <DragHandle
                {...reorder.handleProps(i)}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={e.name}
                accessibilityHint={t('plan.reorderHint')}
                accessibilityActions={[
                  { name: 'decrement', label: t('plan.moveUp') },
                  { name: 'increment', label: t('plan.moveDown') },
                ]}
                onAccessibilityAction={(ev) => {
                  const to = i + moveActionDelta(ev.nativeEvent.actionName);
                  if (to >= 0 && to < exercises.length) move(i, to);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}
              >
                <Icon name="grip" size={20} color={colors.textMuted} />
                <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                  {e.name}
                </Text>
                <Text variant="label" muted>
                  {t(`session.state.${state}`)}
                </Text>
              </DragHandle>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
