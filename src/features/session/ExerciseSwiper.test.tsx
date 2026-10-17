import { act, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { Text } from '@/components/ui/Text';
import { useAppearanceStore } from '@/design/appearance-store';
import { swipeOffset, swipeStep } from '@/features/navigation/swipe';
import { renderUI } from '@/test/render';
import { ExerciseSwiper } from './ExerciseSwiper';

const swipe = (translationX: number, velocityX = 0) =>
  fireGestureHandler(getByGestureTestId('exercise-swipe'), [
    { state: State.BEGAN, translationX: 0 },
    { state: State.ACTIVE, translationX: translationX / 2 },
    { state: State.ACTIVE, translationX },
    { state: State.END, translationX, velocityX },
  ]);

async function setup(canPrevious = true, canNext = true) {
  const onPrevious = jest.fn();
  const onNext = jest.fn();
  await renderUI(
    <ExerciseSwiper
      page="a"
      order={1}
      canPrevious={canPrevious}
      canNext={canNext}
      onPrevious={onPrevious}
      onNext={onNext}
    >
      <Text>{'bench press'}</Text>
    </ExerciseSwiper>,
  );
  return { onPrevious, onNext };
}

describe('swipe between exercises', () => {
  beforeEach(() => useAppearanceStore.getState().set('reduceMotion', true));
  afterEach(async () => {
    await act(() => useAppearanceStore.getState().reset());
  });

  it('a swipe to the left opens the next exercise, to the right the previous one', async () => {
    const { onPrevious, onNext } = await setup();
    expect(screen.getByText('bench press')).toBeTruthy();
    await act(() => swipe(-300, -1000));
    expect(onNext).toHaveBeenCalledTimes(1);
    await act(() => swipe(300, 1000));
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it('a short slow drag goes back; nothing happens where there is no neighbour', async () => {
    const { onPrevious, onNext } = await setup(false, true);
    await act(() => swipe(-40));
    await act(() => swipe(300, 2000));
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it('decides the step from distance and speed', () => {
    expect(swipeStep(-250, 0, 400, true, true)).toBe(1);
    expect(swipeStep(-60, -900, 400, true, true)).toBe(1);
    expect(swipeStep(250, 0, 400, true, true)).toBe(-1);
    expect(swipeStep(250, 0, 400, false, true)).toBe(0);
    expect(swipeStep(-100, 0, 400, true, true)).toBe(0);
    expect(swipeOffset(-80, true, false)).toBe(-20);
    expect(swipeOffset(-80, true, true)).toBe(-80);
  });
});
