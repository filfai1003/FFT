import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { dropTarget, type CardRect } from './edit-grid';
import {
  moveShown,
  moveWidgetTo,
  showWidget,
  updateWidget,
  type WidgetId,
  type WidgetItem,
} from './layout-store';

export const WIDGET_GAP = 10;
const WIGGLE_DEG = 0.6;
const HOLD_TO_EDIT_MS = 450;
const HOLD_TO_DRAG_MS = 150;

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
};

/**
 * The Today cards in a 2-column grid (small = half the width, large = the whole width). Outside
 * edit mode a long press on any card starts edit mode. In edit mode (DECISIONS 72) the cards
 * wiggle (not with reduce motion), can be held and dragged onto another card's place, made
 * small / wide, or hidden; hidden cards wait in the "Add cards" tray below. Screen readers get
 * move up / down, resize and hide as actions on each card.
 */
export function TodayGrid({
  widgets,
  editing,
  renderWidget,
  onEnterEdit,
  onChange,
  aiDock,
  onAiDock,
}: GridProps) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const rects = useSharedValue<CardRect[]>([]);
  const hover = useSharedValue('');
  const shown = widgets.filter((w) => w.visible);
  const hidden = widgets.filter((w) => !w.visible);
  // Two small cards side by side leave the same gap as the rows above and below.
  const half = width > 0 ? (width - WIDGET_GAP) / 2 : '48%';

  const drop = (id: WidgetId, targetId: string) => {
    tick();
    const target = shown.find((w) => w.id === targetId);
    if (target && target.id !== id) onChange(moveWidgetTo(widgets, id, target.id));
  };

  return (
    <View style={{ gap: 14 }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: WIDGET_GAP }}
      >
        {shown.map((item, n) => (
          <TodayCard
            key={item.id}
            item={item}
            index={n}
            count={shown.length}
            width={item.size === 'large' ? '100%' : half}
            editing={editing}
            rects={rects}
            hover={hover}
            onEnterEdit={onEnterEdit}
            onDrop={drop}
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
  width,
  editing,
  rects,
  hover,
  onEnterEdit,
  onDrop,
  onMove,
  onResize,
  onHide,
  children,
}: {
  item: WidgetItem;
  index: number;
  count: number;
  width: number | `${number}%`;
  editing: boolean;
  rects: SharedValue<CardRect[]>;
  hover: SharedValue<string>;
  onEnterEdit: () => void;
  onDrop: (id: WidgetId, targetId: string) => void;
  onMove: (delta: -1 | 1) => void;
  onResize: () => void;
  onHide: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { colors, reduceMotion, oneHandMode } = useTheme();
  const name = t(`today.widget.${item.id}`);
  const id = item.id;
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);
  const rotation = useSharedValue(0);

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

  const pickUp = () => tick();

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
      lifted.set(1);
      scheduleOnRN(pickUp);
    })
    .onUpdate((e) => {
      'worklet';
      dx.set(e.translationX);
      dy.set(e.translationY);
      const all = rects.get();
      const own = all.find((r) => r.id === id);
      if (own)
        hover.set(
          dropTarget(
            all,
            id,
            own.x + own.w / 2 + e.translationX,
            own.y + own.h / 2 + e.translationY,
          ),
        );
    })
    .onEnd((e) => {
      'worklet';
      const all = rects.get();
      const own = all.find((r) => r.id === id);
      const target = own
        ? dropTarget(
            all,
            id,
            own.x + own.w / 2 + e.translationX,
            own.y + own.h / 2 + e.translationY,
          )
        : id;
      scheduleOnRN(onDrop, id, target);
    })
    .onFinalize(() => {
      'worklet';
      lifted.set(0);
      dx.set(0);
      dy.set(0);
      hover.set('');
    });

  const outer = useAnimatedStyle(() => ({ zIndex: lifted.get() ? 10 : 0 }));
  const inner = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx.get() },
      { translateY: dy.get() },
      { rotate: `${lifted.get() ? 0 : rotation.get()}deg` },
      { scale: lifted.get() ? 1.03 : 1 },
    ],
    opacity: lifted.get() ? 0.92 : 1,
  }));
  // The card it would land on gets the selection border (2px, text colour).
  const target = useAnimatedStyle(() => ({ opacity: hover.get() === id && !lifted.get() ? 1 : 0 }));

  const sizeLabel = item.size === 'large' ? t('today.sizeLarge') : t('today.sizeSmall');
  const control = oneHandMode ? 52 : touch.minTarget;

  return (
    <Animated.View
      layout={reduceMotion ? undefined : LinearTransition.duration(220)}
      onLayout={(e) => {
        const { x, y, width: w, height: h } = e.nativeEvent.layout;
        rects.set([...rects.get().filter((r) => r.id !== id), { id, x, y, w, h }]);
      }}
      style={[{ width, flexDirection: 'column' }, outer]}
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
          <View
            pointerEvents={editing ? 'none' : 'auto'}
            aria-hidden={editing}
            style={{ flexGrow: 1 }}
          >
            {children}
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                borderRadius: item.size === 'large' ? radius.card : radius.cardSmall,
                borderWidth: 2,
                borderColor: colors.borderSelected,
              },
              target,
            ]}
          />
          {editing ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('today.hide', { name })}
                onPress={onHide}
                hitSlop={4}
                style={{
                  position: 'absolute',
                  left: -8,
                  top: -8,
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
                  position: 'absolute',
                  right: 6,
                  bottom: 6,
                  minHeight: control,
                  paddingHorizontal: 12,
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
                  <Text variant="label" medium>
                    {item.size === 'large' ? t('today.sizeSmall') : t('today.sizeLarge')}
                  </Text>
                </View>
              </Pressable>
            </>
          ) : null}
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
