import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { DragHandle, moveActionDelta, useReorder } from '@/components/ui/reorder';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { moveWidget, useHomeLayout, type WidgetSize } from './layout-store';

export { targetIndex } from '@/components/ui/reorder';

/** Choose what the Today screen shows, in which order and how big. Hold a row and slide to reorder. */
export function CustomizeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { widgets, aiDock, setWidgets, setAiDock } = useHomeLayout();
  const reorder = useReorder(
    widgets.map((w) => w.id),
    (from, to) => setWidgets(moveWidget(widgets, from, to - from)),
  );

  const update = (index: number, patch: Partial<{ size: WidgetSize; visible: boolean }>) =>
    setWidgets(widgets.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('today.customize')}
      closeLabel={t('common.close')}
    >
      <View>
        {widgets.map((w, i) => {
          const name = t(`today.widget.${w.id}`);
          const row = reorder.rowProps(i);
          return (
            <View
              key={w.id}
              onLayout={row.onLayout}
              style={[
                {
                  gap: 8,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderColor: colors.borderDecorative,
                  backgroundColor: colors.surface,
                },
                row.style,
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <DragHandle
                  {...reorder.handleProps(i)}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel={name}
                  accessibilityHint={t('today.reorderHint')}
                  accessibilityActions={[
                    { name: 'decrement', label: t('today.moveUp', { name }) },
                    { name: 'increment', label: t('today.moveDown', { name }) },
                  ]}
                  onAccessibilityAction={(e) =>
                    setWidgets(moveWidget(widgets, i, moveActionDelta(e.nativeEvent.actionName)))
                  }
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 44,
                  }}
                >
                  <Icon name="grip" size={20} color={colors.textMuted} />
                  <Text variant="body" style={{ flex: 1 }}>
                    {name}
                  </Text>
                </DragHandle>
                <Toggle
                  value={w.visible}
                  onValueChange={(visibleNow) => update(i, { visible: visibleNow })}
                  accessibilityLabel={t('today.show', { name })}
                />
              </View>
              {w.visible ? (
                <Segmented
                  accessibilityLabel={t('today.size', { name })}
                  value={w.size}
                  onChange={(size) => update(i, { size })}
                  options={[
                    { value: 'small', label: t('today.sizeSmall') },
                    { value: 'large', label: t('today.sizeLarge') },
                  ]}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 10,
          borderTopWidth: 1,
          borderColor: colors.borderDecorative,
        }}
      >
        <Text variant="body" style={{ flex: 1 }}>
          {t('today.widget.ai')}
        </Text>
        <Toggle
          value={aiDock}
          onValueChange={setAiDock}
          accessibilityLabel={t('today.show', { name: t('today.widget.ai') })}
        />
      </View>
    </Sheet>
  );
}
