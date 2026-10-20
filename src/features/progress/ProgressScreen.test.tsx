import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import type { BodyEntry, Photo } from './data';
import { ProgressScreen } from './ProgressScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/features/profile/use-today', () => ({ useToday: () => '2026-10-14' }));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: { goal: 'lose_fat' } }) }));
jest.mock('@/features/profile/screen-privacy', () => ({ usePhotoScreenPrivacy: () => undefined }));
jest.mock('@/features/gamification/data', () => ({ useGamification: () => null }));
jest.mock('@/features/train/exercises', () => ({
  useExercises: () => ({ data: [], isPending: false }),
}));
jest.mock('@/features/community/CommunityView', () => ({
  CommunityView: () => null,
  CommunityAvatarButton: () => null,
  useCommunityBottomSpace: () => 24,
}));

const mockData: { entries: BodyEntry[]; photos: Photo[] } = { entries: [], photos: [] };
jest.mock('./data', () => ({
  ...jest.requireActual('./data'),
  useBodyEntries: () => ({ isPending: false, isSuccess: true, data: mockData.entries }),
  usePhotos: () => ({ isPending: false, isSuccess: true, data: mockData.photos }),
  useDailyE1rm: () => ({ isPending: false, data: [] }),
  usePhotoUrl: () => ({ data: null }),
  useBodyGoal: () => ({ data: null }),
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

describe('Progress · Me numbers (DECISIONS 114)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockData.entries = [];
    mockData.photos = [];
  });

  it('nothing logged: every card is drawn unfilled and opens the check-in, no bare dashes', async () => {
    await renderUI(<ProgressScreen />);
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.getByText('No weight yet')).toBeTruthy();
    expect(screen.getAllByText('Add at check-in').length).toBe(3);
    expect(screen.getByText('Your first photos become your before')).toBeTruthy();
    expect(screen.getByText('No strength change yet')).toBeTruthy();
    // Nothing to compare yet: the button waits for the first photos.
    expect(screen.queryByText('Compare two photo dates')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Body fat: nothing logged yet. Add a check-in'));
    expect(mockPush).toHaveBeenLastCalledWith('/check-in');
    await fireEvent.press(screen.getByLabelText('No weight yet. Add a check-in'));
    expect(mockPush).toHaveBeenLastCalledWith('/check-in');
    await fireEvent.press(screen.getByLabelText('No photos yet. Add photos'));
    expect(mockPush).toHaveBeenLastCalledWith('/check-in');
  });

  it('one check-in: the number, and where the line will start', async () => {
    mockData.entries = [entry('2026-10-13', { weightKg: 81.4, bodyFatPct: 18 })];
    await renderUI(<ProgressScreen />);
    expect(screen.getByText('81.4')).toBeTruthy();
    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getAllByText('Your line starts at the next check-in').length).toBe(2);
    await fireEvent.press(screen.getByLabelText('Body fat, 18 %'));
    expect(mockPush).toHaveBeenLastCalledWith('/progress/body');
  });

  it('a trend: the change with an arrow and words, green toward the goal', async () => {
    mockData.entries = [
      entry('2026-09-01', { weightKg: 84, bodyFatPct: 20, measures: { waist: 88 } }),
      entry('2026-09-20', { weightKg: 83, bodyFatPct: 19.5, measures: { waist: 87 } }),
      entry('2026-10-13', { weightKg: 82, bodyFatPct: 19, measures: { waist: 85 } }),
    ];
    await renderUI(<ProgressScreen />);
    expect(screen.getByText('2.0 kg')).toBeTruthy();
    expect(screen.getByText('1.0 pts')).toBeTruthy();
    expect(screen.getByText('3 cm')).toBeTruthy();
    expect(screen.getByLabelText('Weight over the period')).toBeTruthy();
    expect(screen.queryByText('Add at check-in')).toBeNull();
  });
});
