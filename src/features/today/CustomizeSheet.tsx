import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { moveWidget, useHomeLayout, type WidgetSize } from './layout-store';

/** Choose what the Today screen shows, in which order and how big. */
export function CustomizeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { widgets, aiDock, setWidgets, setAiDock } = useHomeLayout();

  const update = (index: number, patch: Partial<{ size: WidgetSize; visible: boolean }>) =>
    setWidgets(widgets.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('today.customize')}
      closeLabel={t('common.close')}
    >
      <Text muted>{t('today.customizeHint')}</Text>
      {widgets.map((w, i) => {
        const name = t(`today.widget.${w.id}`);
        return (
          <View
            key={w.id}
            style={{
              gap: 8,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderColor: colors.borderDecorative,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text variant="body" style={{ flex: 1 }}>
                {name}
              </Text>
              <IconButton
                icon="arrowUp"
                accessibilityLabel={t('today.moveUp', { name })}
                disabled={i === 0}
                onPress={() => setWidgets(moveWidget(widgets, i, -1))}
              />
              <IconButton
                icon="arrowDown"
                accessibilityLabel={t('today.moveDown', { name })}
                disabled={i === widgets.length - 1}
                onPress={() => setWidgets(moveWidget(widgets, i, 1))}
              />
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
