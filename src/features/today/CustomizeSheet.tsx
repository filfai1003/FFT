import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PanResponder, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { moveWidget, useHomeLayout, type WidgetId, type WidgetSize } from './layout-store';

const HOLD_MS = 220;

/** Where a row dragged by `dy` pixels lands: past half of a neighbour it swaps with it. */
export function targetIndex(heights: readonly number[], from: number, dy: number): number {
  let to = from;
  let travelled = 0;
  if (dy > 0) {
    for (let i = from + 1; i < heights.length; i++) {
      const h = heights[i] ?? 0;
      if (dy > travelled + h / 2) to = i;
      else break;
      travelled += h;
    }
  } else if (dy < 0) {
    for (let i = from - 1; i >= 0; i--) {
      const h = heights[i] ?? 0;
      if (-dy > travelled + h / 2) to = i;
      else break;
      travelled += h;
    }
  }
  return to;
}

/** Choose what the Today screen shows, in which order and how big. Hold a row and slide to reorder. */
export function CustomizeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { widgets, aiDock, setWidgets, setAiDock } = useHomeLayout();
  const [heights, setHeights] = useState<Partial<Record<WidgetId, number>>>({});
  const [drag, setDrag] = useState<{ index: number; dy: number } | null>(null);

  const update = (index: number, patch: Partial<{ size: WidgetSize; visible: boolean }>) =>
    setWidgets(widgets.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  const drop = (index: number, dy: number) => {
    const to = targetIndex(
      widgets.map((w) => heights[w.id] ?? 0),
      index,
      dy,
    );
    if (to !== index) setWidgets(moveWidget(widgets, index, to - index));
  };

  const hs = widgets.map((w) => heights[w.id] ?? 0);
  const to = drag ? targetIndex(hs, drag.index, drag.dy) : -1;
  const dragged = drag ? (hs[drag.index] ?? 0) : 0;

  /** Rows between the old and the new place make room for the one being dragged. */
  const shiftOf = (i: number) => {
    if (!drag || i === drag.index) return 0;
    if (to > drag.index && i > drag.index && i <= to) return -dragged;
    if (to < drag.index && i < drag.index && i >= to) return dragged;
    return 0;
  };

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
          const dragging = drag?.index === i;
          return (
            <View
              key={w.id}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                setHeights((prev) => (prev[w.id] === h ? prev : { ...prev, [w.id]: h }));
              }}
              style={{
                gap: 8,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderColor: colors.borderDecorative,
                backgroundColor: colors.surface,
                zIndex: dragging ? 2 : 0,
                opacity: dragging ? 0.9 : 1,
                transform: [{ translateY: dragging ? drag.dy : shiftOf(i) }],
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <DragHandle
                  index={i}
                  onDrag={setDrag}
                  onDrop={drop}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel={name}
                  accessibilityHint={t('today.reorderHint')}
                  accessibilityActions={[
                    { name: 'decrement', label: t('today.moveUp', { name }) },
                    { name: 'increment', label: t('today.moveDown', { name }) },
                  ]}
                  onAccessibilityAction={(e) =>
                    setWidgets(
                      moveWidget(widgets, i, e.nativeEvent.actionName === 'increment' ? 1 : -1),
                    )
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

/** The grip and name of a row: hold it for a moment, then slide to move the row. */
function DragHandle({
  index,
  onDrag,
  onDrop,
  children,
  ...a11y
}: {
  index: number;
  onDrag: (drag: { index: number; dy: number } | null) => void;
  onDrop: (index: number, dy: number) => void;
  children: ReactNode;
  accessible: boolean;
  accessibilityRole: 'adjustable';
  accessibilityLabel: string;
  accessibilityHint: string;
  accessibilityActions: { name: string; label: string }[];
  onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => void;
  style: object;
}) {
  const props = useRef({ index, onDrag, onDrop });
  useEffect(() => {
    props.current = { index, onDrag, onDrop };
  });
  // The handlers outlive the render and read the latest props through the ref.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = false;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => !active,
      onPanResponderGrant: () => {
        timer = setTimeout(() => {
          active = true;
          props.current.onDrag({ index: props.current.index, dy: 0 });
        }, HOLD_MS);
      },
      onPanResponderMove: (_e, g) => {
        if (active) props.current.onDrag({ index: props.current.index, dy: g.dy });
        else if (Math.abs(g.dy) > 10) cancel();
      },
      onPanResponderRelease: (_e, g) => {
        cancel();
        if (active) props.current.onDrop(props.current.index, g.dy);
        active = false;
        props.current.onDrag(null);
      },
      onPanResponderTerminate: () => {
        cancel();
        active = false;
        props.current.onDrag(null);
      },
    });
  });
  return (
    <View {...responder.panHandlers} {...a11y}>
      {children}
    </View>
  );
}
