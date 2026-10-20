import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { BodyScreen } from './BodyScreens';
import type { BodyEntry } from './data';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-14' }));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: { goal: 'lose_fat' } }) }));

const mockData: { entries: BodyEntry[] } = { entries: [] };
const mockMutation = { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false };
jest.mock('./data', () => ({
  ...jest.requireActual('./data'),
  useBodyEntries: () => ({ isPending: false, isSuccess: true, data: mockData.entries }),
  useBodyGoal: () => ({ data: null }),
  useDeleteEntry: () => mockMutation,
  useSetBodyGoal: () => mockMutation,
}));

const entry = (day: string, e: Partial<BodyEntry>): BodyEntry => ({
  id: day,
  day,
  createdAt: `${day}T08:00:00Z`,
  weightKg: null,
  bodyFatPct: null,
  method: null,
  measures: {},
  notes: null,
  ...e,
});

describe('Body page (DECISIONS 114)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockData.entries = [];
  });

  it('no check-in yet: one invitation instead of a page of dashes', async () => {
    await renderUI(<BodyScreen />);
    expect(screen.getByRole('header', { name: 'No check-ins yet' })).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Add a check-in' }));
    expect(mockPush).toHaveBeenCalledWith('/check-in');
  });

  it('changes as chips with words for screen readers; only measured sizes, changed or not', async () => {
    mockData.entries = [
      entry('2026-09-01', { weightKg: 84, bodyFatPct: 20, measures: { waist: 88 } }),
      entry('2026-10-13', { weightKg: 82, measures: { waist: 85, arm: 36 } }),
    ];
    await renderUI(<BodyScreen />);
    expect(screen.getByLabelText('Weight, 82 kg, down 2.0 kg')).toBeTruthy();
    // Body fat logged once: the value, no change yet.
    expect(screen.getByLabelText('Body fat, 20 %')).toBeTruthy();
    expect(screen.getByLabelText('Waist, 85.0 cm, down 3.0 cm')).toBeTruthy();
    expect(screen.getByLabelText('Arm, 36.0 cm')).toBeTruthy();
    expect(screen.queryByText('Hips')).toBeNull();
    expect(screen.getByLabelText('Weekly average weight over the period')).toBeTruthy();
    // Body fat has one value: where its line will start.
    expect(screen.getByText('Your line starts at the next check-in')).toBeTruthy();
  });
});
