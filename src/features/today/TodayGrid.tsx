import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import {
  dropRows,
  gridGeometry,
  packRows,
  rowsKey,
  rowsToShown,
  type CardBox,
  type GridRow,
  type RowBand,
} from './edit-grid';
import {
  moveShown,
  showWidget,
  updateWidget,
  type WidgetId,
  type WidgetItem,
} from './layout-store';

export const WIDGET_GAP = 10;
const WIGGLE_DEG = 0.6;
const HOLD_TO_EDIT_MS = 450;
const HOLD_TO_DRAG_MS = 150;
const MOVE_MS = 220;

type GridProps = {
  widgets: readonly WidgetItem[];
  editing: boolean;
  renderWidget: (item: WidgetItem, index: number) => ReactNode;
  /** A long press on a card (outside edit mode) asks for edit mode. */
  onEnterEdit: () => void;
  /** Edit mode: the new list after a move, resize, hide or add. */
  onChange: (widgets: readonly WidgetItem[]) => void;
  aiDock: boolean;
  onAiDock: (visible: boolean) => void;
  /** Where each card sits in the grid (Home scrolls to a card from its day ring). */
  onBoxes?: (boxes: ReadonlyMap<WidgetId, CardBox>) => void;
};

/** The rows and row places when a drag started: every drop is worked out from them. */
type Drag = { id: WidgetId; rows: GridRow[]; bands: RowBand[] };

/**
 * The Today cards on a 2-column grid laid out like a phone's home screen (DECISIONS 72, 106):
 * rows of one wide card or two half-width slots, a slot may stay empty. Outside edit mode a long
 * press on any card starts edit mode. In edit mode the cards wiggle (not with reduce motion), can
 * be held and dragged: the others make room live, showing the page as it will be when the card is
 * let go, and a dashed outline marks where it will land. Cards can also be made small / wide or
 * hidden; hidden cards wait in the "Add cards" tray below. Screen readers get move up / down,
 * resize and hide as actions on each card.
 */
export function TodayGrid({
  widgets,
  editing,
  renderWidget,
  onEnterEdit,
  onChange,
  aiDock,
  onAiDock,
  onBoxes,
}: GridProps) {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  // Each card's measured height, and whether it was measured while held up by a minimum height
  // (then its own height may be smaller: see the pairs below).
  const [measures, setMeasures] = useState<ReadonlyMap<WidgetId, { h: number; held: boolean }>>(
    () => new Map(),
  );
  const heights = new Map([...measures].map(([id, m]) => [id, m.h]));
  const [drag, setDrag] = useState<Drag | null>(null);
  // The rows as they would be if the dragged card were let go now.
  const [preview, setPreview] = useState<GridRow[] | null>(null);
  const shown = widgets.filter((w) => w.visible);
  const hidden = widgets.filter((w) => !w.visible);
  const rows = preview ?? packRows(shown);
  const geometry = gridGeometry(rows, width, WIDGET_GAP, heights);
  const measured = width > 0 && shown.every((w) => heights.has(w.id));

  // Two half-width cards in a row are as tall as the taller one: the shorter one gets a minimum
  // height just under it (so the taller one keeps being measured at its own height). When the
  // taller one shrinks (leaving edit mode drops the toolbars) below the one held up, that one is
  // let go for a frame to measure its own height; holding it would make the two take turns being
  // the taller one, half a pixel at a time.
  const minHeight = new Map<WidgetId, number>();
  for (const r of rows) {
    if (r.kind !== 'pair' || !r.left || !r.right) continue;
    const ml = measures.get(r.left);
    const mr = measures.get(r.right);
    if (!ml || !mr) continue;
    if ((ml.held && mr.h < ml.h - 1) || (mr.held && ml.h < mr.h - 1)) continue;
    minHeight.set(mr.h > ml.h ? r.left : r.right, Math.max(ml.h, mr.h) - 0.5);
  }

  const measure = (id: WidgetId, h: number) => {
    const min = minHeight.get(id);
    const held = min != null && h <= min + 1;
    setMeasures((prev) => {
      const cur = prev.get(id);
      return cur && cur.h === h && cur.held === held ? prev : new Map(prev).set(id, { h, held });
    });
  };

  const startDrag = (id: WidgetId) => {
    tick();
    setDrag({ id, rows, bands: geometry.bands });
  };
  const hoverDrag = (id: WidgetId, cx: number, cy: number) => {
    const item = shown.find((w) => w.id === id);
    if (!drag || drag.id !== id || !item) return;
    const next = dropRows(drag.rows, drag.bands, item, cx, cy, width);
    if (rowsKey(next) !== rowsKey(rows))
      setPreview(rowsKey(next) === rowsKey(drag.rows) ? null : next);
  };
  const endDrag = (dropped: boolean) => {
    if (dropped) tick();
    if (dropped && preview) onChange([...rowsToShown(preview, shown), ...hidden]);
    setPreview(null);
    setDrag(null);
  };

  const boxes = geometry.boxes;
  useEffect(() => {
    onBoxes?.(boxes);
  }, [onBoxes, boxes]);

  const target = drag ? geometry.boxes.get(drag.id) : undefined;

  return (
    <View style={{ gap: 14 }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: measured ? geometry.height : undefined, opacity: measured ? 1 : 0 }}
      >
        {target && drag ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: target.x,
              top: target.y,
              width: target.w,
              height: geometry.rowHeight.get(drag.id) ?? heights.get(drag.id) ?? 0,
              borderRadius: radius.card,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.borderControl,
            }}
          />
        ) : null}
        {shown.map((item, n) => (
          <TodayCard
            key={item.id}
            item={item}
            index={n}
            count={shown.length}
            box={geometry.boxes.get(item.id) ?? { x: 0, y: 0, w: 0 }}
            width={width > 0 ? undefined : item.size === 'large' ? '100%' : '48%'}
            minHeight={minHeight.get(item.id)}
            editing={editing}
            animate={editing && measured && !reduceMotion}
            dragging={drag?.id === item.id}
            onMeasure={measure}
            onEnterEdit={onEnterEdit}
            onDragStart={startDrag}
            onDragMove={hoverDrag}
            onDragEnd={endDrag}
            onMove={(delta) => onChange(moveShown(widgets, item.id, delta))}
            onResize={() =>
              onChange(
                updateWidget(widgets, item.id, {
                  size: item.size === 'large' ? 'small' : 'large',
                }),
              )
            }
            onHide={() => {
              tick();
              onChange(updateWidget(widgets, item.id, { visible: false }));
            }}
          >
            {renderWidget(item, n)}
          </TodayCard>
        ))}
      </View>
      {shown.length === 0 && !editing ? <Text muted>{t('today.empty')}</Text> : null}
      {editing ? (
        <Tray
          hidden={hidden}
          onAdd={(id) => {
            tick();
            onChange(showWidget(widgets, id));
          }}
          aiDock={aiDock}
          onAiDock={onAiDock}
        />
      ) : null}
    </View>
  );
}

function TodayCard({
  item,
  index,
  count,
  box,
  width,
  minHeight,
  editing,
  animate,
  dragging,
  onMeasure,
  onEnterEdit,
  onDragStart,
  onDragMove,
  onDragEnd,
  onMove,
  onResize,
  onHide,
  children,
}: {
  item: WidgetItem;
  index: number;
  count: number;
  /** Where the card goes on the grid. */
  box: CardBox;
  /** Before the grid is measured: a width in % instead of the box's. */
  width?: `${number}%`;
  minHeight?: number;
  editing: boolean;
  /** Moves to a new place smoothly (edit mode, no reduce motion). */
  animate: boolean;
  /** This card is the one being dragged. */
  dragging: boolean;
  onMeasure: (id: WidgetId, height: number) => void;
  onEnterEdit: () => void;
  onDragStart: (id: WidgetId) => void;
  onDragMove: (id: WidgetId, cx: number, cy: number) => void;
  onDragEnd: (dropped: boolean) => void;
  onMove: (delta: -1 | 1) => void;
  onResize: () => void;
  onHide: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { colors, reduceMotion, oneHandMode } = useTheme();
  const name = t(`today.widget.${item.id}`);
  const id = item.id;
  // The card's place (animated towards its box), and while dragged: where it was picked up plus
  // the finger's movement.
  const x = useSharedValue(box.x);
  const y = useSharedValue(box.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const height = useSharedValue(0);
  const lifted = useSharedValue(0);
  const raised = useSharedValue(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (animate && !dragging) {
      x.set(withTiming(box.x, { duration: MOVE_MS }));
      y.set(withTiming(box.y, { duration: MOVE_MS }));
    } else {
      x.set(box.x);
      y.set(box.y);
    }
  }, [box.x, box.y, animate, dragging, x, y]);

  // A gentle wiggle while editing, alternating direction from card to card.
  useEffect(() => {
    cancelAnimation(rotation);
    rotation.set(0);
    if (!editing || reduceMotion) return;
    const a = index % 2 === 0 ? WIGGLE_DEG : -WIGGLE_DEG;
    rotation.set(
      withRepeat(
        withSequence(withTiming(a, { duration: 140 }), withTiming(-a, { duration: 140 })),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(rotation);
  }, [editing, reduceMotion, index, rotation]);

  const hold = Gesture.LongPress()
    .enabled(!editing)
    .minDuration(HOLD_TO_EDIT_MS)
    .onStart(() => {
      'worklet';
      scheduleOnRN(onEnterEdit);
    });

  const drag = Gesture.Pan()
    .enabled(editing)
    .activateAfterLongPress(HOLD_TO_DRAG_MS)
    .onStart(() => {
      'worklet';
      cancelAnimation(x);
      cancelAnimation(y);
      startX.set(x.get());
      startY.set(y.get());
      tx.set(0);
      ty.set(0);
      lifted.set(1);
      raised.set(1);
      scheduleOnRN(onDragStart, id);
    })
    .onUpdate((e) => {
      'worklet';
      tx.set(e.translationX);
      ty.set(e.translationY);
      scheduleOnRN(
        onDragMove,
        id,
        startX.get() + box.w / 2 + e.translationX,
        startY.get() + height.get() / 2 + e.translationY,
      );
    })
    .onFinalize((_e, success) => {
      'worklet';
      if (!lifted.get()) return;
      // From where it was let go, the card glides to its place (set again when the drop lands).
      x.set(startX.get() + tx.get());
      y.set(startY.get() + ty.get());
      lifted.set(0);
      raised.set(withTiming(0, { duration: reduceMotion ? 0 : MOVE_MS }));
      scheduleOnRN(onDragEnd, success);
    });

  const outer = useAnimatedStyle(() => {
    const up = lifted.get() === 1;
    return {
      zIndex: raised.get() > 0 ? 10 : 0,
      transform: [
        { translateX: up ? startX.get() + tx.get() : x.get() },
        { translateY: up ? startY.get() + ty.get() : y.get() },
      ],
    };
  });
  const inner = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${lifted.get() ? 0 : rotation.get()}deg` },
      { scale: lifted.get() ? 1.03 : 1 },
    ],
    opacity: lifted.get() ? 0.92 : 1,
  }));

  const sizeLabel = item.size === 'large' ? t('today.sizeLarge') : t('today.sizeSmall');
  const control = oneHandMode ? 52 : touch.minTarget;

  return (
    <Animated.View
      testID={`grid-card-${id}`}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        height.set(h);
        onMeasure(id, h);
      }}
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: width ?? box.w,
          minHeight,
          flexDirection: 'column',
        },
        outer,
      ]}
    >
      <GestureDetector gesture={Gesture.Exclusive(drag, hold)}>
        <Animated.View
          style={[{ flexGrow: 1 }, inner]}
          // In edit mode the card is one element for screen readers, with its edit actions.
          accessible={editing}
          accessibilityLabel={editing ? t('today.editCard', { name, size: sizeLabel }) : undefined}
          accessibilityHint={editing ? t('today.editCardHint') : undefined}
          accessibilityActions={
            editing
              ? [
                  ...(index > 0 ? [{ name: 'moveUp', label: t('today.moveUp', { name }) }] : []),
                  ...(index < count - 1
                    ? [{ name: 'moveDown', label: t('today.moveDown', { name }) }]
                    : []),
                  {
                    name: 'resize',
                    label:
                      item.size === 'large'
                        ? t('today.makeSmall', { name })
                        : t('today.makeLarge', { name }),
                  },
                  { name: 'hide', label: t('today.hide', { name }) },
                ]
              : undefined
          }
          onAccessibilityAction={(e) => {
            const action = e.nativeEvent.actionName;
            if (action === 'moveUp') onMove(-1);
            else if (action === 'moveDown') onMove(1);
            else if (action === 'resize') onResize();
            else if (action === 'hide') onHide();
          }}
        >
          {/* Edit controls sit in their own row above the card: they never cover its content. */}
          {editing ? (
            <View
              testID={`edit-toolbar-${id}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
                minHeight: control,
                marginBottom: 2,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('today.hide', { name })}
                onPress={onHide}
                style={{
                  width: control,
                  height: control,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.text,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="minus" size={18} color={colors.bg} />
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  item.size === 'large'
                    ? t('today.makeSmall', { name })
                    : t('today.makeLarge', { name })
                }
                onPress={() => {
                  tick();
                  onResize();
                }}
                style={{
                  minHeight: control,
                  flexShrink: 1,
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.borderControl,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Text variant="label" medium numberOfLines={1}>
                    {item.size === 'large' ? t('today.sizeSmall') : t('today.sizeLarge')}
                  </Text>
                </View>
              </Pressable>
            </View>
          ) : null}
          <View
            pointerEvents={editing ? 'none' : 'auto'}
            aria-hidden={editing}
            style={{ flexGrow: 1 }}
          >
            {children}
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

/** Edit mode: the hidden cards, ready to be added back, and the AI coach bar switch. */
function Tray({
  hidden,
  onAdd,
  aiDock,
  onAiDock,
}: {
  hidden: readonly WidgetItem[];
  onAdd: (id: WidgetId) => void;
  aiDock: boolean;
  onAiDock: (visible: boolean) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const row = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderColor: colors.borderDecorative,
  };
  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <View style={{ padding: 14, gap: 2 }}>
        <Text variant="body" medium accessibilityRole="header">
          {t('today.addCards')}
        </Text>
        <Text variant="bodyS" muted>
          {hidden.length > 0 ? t('today.addCardsInfo') : t('today.addCardsNone')}
        </Text>
      </View>
      {hidden.map((w) => {
        const name = t(`today.widget.${w.id}`);
        return (
          <Pressable
            key={w.id}
            accessibilityRole="button"
            accessibilityLabel={t('today.addCard', { name })}
            onPress={() => onAdd(w.id)}
            style={({ pressed }) => [row, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text variant="body" style={{ flex: 1 }}>
              {name}
            </Text>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.borderControl,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="plus" size={18} color={colors.text} />
            </View>
          </Pressable>
        );
      })}
      <View style={row}>
        <Text variant="body" style={{ flex: 1 }}>
          {t('today.widget.ai')}
        </Text>
        <Toggle
          value={aiDock}
          onValueChange={onAiDock}
          accessibilityLabel={t('today.show', { name: t('today.widget.ai') })}
        />
      </View>
    </View>
  );
}
