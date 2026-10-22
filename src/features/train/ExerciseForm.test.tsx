import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { ExerciseForm } from './ExerciseForm';

const mockSave = jest.fn(async () => {});
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('@/features/auth/session-store', () => ({
  useSessionStore: (pick: (s: { userId: string }) => unknown) => pick({ userId: 'u1' }),
}));
jest.mock('./exercise-image', () => ({ useExerciseImageUri: () => null }));
jest.mock('./pick-image', () => ({ pickSquareImage: jest.fn(), uploadPrivateImage: jest.fn() }));
jest.mock('./exercises', () => ({
  ...jest.requireActual('./exercises'),
  useExercises: () => ({
    data: [
      {
        id: 'mine',
        ownerId: 'u1',
        name: 'Band pull',
        primaryMuscle: 'lats',
        secondaryMuscles: ['upper_back'],
        indirectMuscles: ['biceps'],
        equipment: 'bands',
        logType: 'weight_reps',
        imagePath: null,
      },
    ],
  }),
  useSaveExercise: () => ({ mutateAsync: mockSave, isPending: false }),
}));

describe('Create / edit exercise: muscles at three levels (DECISIONS 125)', () => {
  beforeEach(() => mockSave.mockClear());

  it('picks the main muscle by group, then muscles that help and that steady', async () => {
    await renderUI(<ExerciseForm />);
    // The main muscle, under the six groups of the library, with its explanation.
    for (const g of ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'])
      expect(screen.getAllByText(g).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('About muscles worked')).toBeTruthy();
    // The other rows wait for the main muscle.
    expect(screen.getByText('Optional. Pick the main muscle first.')).toBeTruthy();
    expect(screen.queryByText('Muscles that help (half a set each)')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Name · image optional'), 'Zercher squat');
    await fireEvent.press(screen.getByLabelText('Quads'));
    expect(screen.getByText('Muscles that help (half a set each)')).toBeTruthy();
    expect(screen.getByText('Muscles that steady it (a quarter set each)')).toBeTruthy();
    // The main muscle is not offered again below it.
    expect(screen.getAllByLabelText('Quads')).toHaveLength(1);

    // Chips with the same name: [main muscle, helps, steadies].
    await fireEvent.press(screen.getAllByLabelText('Glutes')[1]);
    await fireEvent.press(screen.getAllByLabelText('Adductors (inner thighs)')[1]);
    await fireEvent.press(screen.getAllByLabelText('Hamstrings')[2]);
    // A muscle sits at one level: picking it as a steadier takes it out of the helpers.
    await fireEvent.press(screen.getAllByLabelText('Glutes')[2]);
    expect(screen.getAllByLabelText('Glutes')[1].props.accessibilityState.checked).toBe(false);

    await fireEvent.press(screen.getByLabelText('Barbell'));
    await fireEvent.press(screen.getByText('Save exercise'));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Zercher squat',
        primaryMuscle: 'quads',
        secondaryMuscles: ['adductors'],
        indirectMuscles: ['hamstrings', 'glutes'],
        equipment: 'barbell',
      }),
    );
  });

  it('editing an own exercise shows its three levels', async () => {
    await renderUI(<ExerciseForm exerciseId="mine" />);
    const [mainLats] = screen.getAllByLabelText('Lats');
    expect(mainLats.props.accessibilityState.checked).toBe(true);
    expect(screen.getAllByLabelText('Upper back')[1].props.accessibilityState.checked).toBe(true);
    expect(screen.getAllByLabelText('Biceps')[2].props.accessibilityState.checked).toBe(true);
  });
});
