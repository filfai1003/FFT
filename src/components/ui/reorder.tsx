import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanResponder, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';

/**
 * Drag to reorder: hold a row's grip for a moment, then slide it; the rows in between make room
 * and the row lands where it is dropped. Screen readers get move up / move down actions on the
 * grip instead (the caller passes them). Used by the Today layout, the day editor and the workout.
 */

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

type Drag = { index: number; dy: number } | null;

/**
 * State of a reorderable list. `keys` identify the rows in order, `gap` is the space between them,
 * `onMove(from, to)` is called on drop.
 */
export function useReorder(
  keys: readonly string[],
  onMove: (from: number, to: number) => void,
  gap = 0,
) {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<Drag>(null);
  const hs = keys.map((k) => (heights[k] ?? 0) + gap);
  const to = drag ? targetIndex(hs, drag.index, drag.dy) : -1;
  const dragged = drag ? (hs[drag.index] ?? 0) : 0;

  const shiftOf = (i: number) => {
    if (!drag || i === drag.index) return 0;
    if (to > drag.index && i > drag.index && i <= to) return -dragged;
    if (to < drag.index && i < drag.index && i >= to) return dragged;
    return 0;
  };

  /** Spread on each row: measures it and moves it while a drag is going on. */
  const rowProps = (i: number): { onLayout: (e: LayoutChangeEvent) => void; style: ViewStyle } => {
    const dragging = drag?.index === i;
    return {
      onLayout: (e) => {
        const h = e.nativeEvent.layout.height;
        const key = keys[i];
        setHeights((prev) => (prev[key] === h ? prev : { ...prev, [key]: h }));
      },
      style: {
        zIndex: dragging ? 2 : 0,
        opacity: dragging ? 0.9 : 1,
        transform: [{ translateY: dragging ? drag.dy : shiftOf(i) }],
      },
    };
  };

  /** Spread on each row's DragHandle. */
  const handleProps = (i: number) => ({
    index: i,
    onDrag: setDrag,
    onDrop: (index: number, dy: number) => {
      const target = targetIndex(hs, index, dy);
      if (target !== index) onMove(index, target);
    },
  });

  return { rowProps, handleProps, dragging: drag?.index ?? null };
}

/** The part of a row you hold to drag it (the grip, often with the name). */
export function DragHandle({
  index,
  onDrag,
  onDrop,
  children,
  ...rest
}: {
  index: number;
  onDrag: (drag: Drag) => void;
  onDrop: (index: number, dy: number) => void;
  children: ReactNode;
  accessible?: boolean;
  accessibilityRole?: 'adjustable';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityActions?: { name: string; label: string }[];
  onAccessibilityAction?: (e: { nativeEvent: { actionName: string } }) => void;
  style?: ViewStyle;
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
    <View {...responder.panHandlers} {...rest}>
      {children}
    </View>
  );
}

/** Screen reader actions of a grip: "decrement" = move up, "increment" = move down. */
export function moveActionDelta(actionName: string): -1 | 1 {
  return actionName === 'increment' ? 1 : -1;
}
