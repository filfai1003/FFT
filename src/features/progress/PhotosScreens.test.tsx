import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import type { BodyEntry, Photo } from './data';
import { ComparePhotosScreen, PhotosScreen } from './PhotosScreens';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: { goal: 'lose_fat' } }) }));
jest.mock('@/features/profile/screen-privacy', () => ({ usePhotoScreenPrivacy: () => undefined }));

const mockData: { photos: Photo[]; entries: BodyEntry[] } = { photos: [], entries: [] };
const mockMutation = { mutate: jest.fn(), isPending: false };
jest.mock('./data', () => ({
  ...jest.requireActual('./data'),
  usePhotos: () => ({ isPending: false, isSuccess: true, data: mockData.photos }),
  useBodyEntries: () => ({ isPending: false, isSuccess: true, data: mockData.entries }),
  useDeletePhoto: () => mockMutation,
  usePhotoUrl: () => ({ data: null }),
  useBodyGoal: () => ({ data: null }),
}));

const photo = (day: string, pose: Photo['pose']): Photo => ({
  id: `${day}-${pose}`,
  day,
  pose,
  path: `u/${day}-${pose}.jpg`,
});
const entry = (day: string, weightKg: number, bodyFatPct: number): BodyEntry => ({
  id: day,
  day,
  createdAt: `${day}T08:00:00Z`,
  weightKg,
  bodyFatPct,
  method: 'scale',
  measures: {},
  notes: null,
});

describe('Photos (DECISIONS 114)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockData.photos = [];
    mockData.entries = [];
  });

  it('no photos: the invitation only, no disabled compare button', async () => {
    await renderUI(<PhotosScreen />);
    expect(screen.getByRole('header', { name: 'No photos yet' })).toBeTruthy();
    expect(screen.queryByText('Compare two check-ins')).toBeNull();
  });

  it('one date: compare says why it waits', async () => {
    mockData.photos = [photo('2026-10-01', 'front')];
    await renderUI(<PhotosScreen />);
    expect(screen.getByText('Compare opens after your second check-in with photos.')).toBeTruthy();
  });

  it('compare with one date of the pose: an empty state that opens the check-in', async () => {
    mockData.photos = [photo('2026-10-01', 'front')];
    await renderUI(<ComparePhotosScreen />);
    expect(screen.getByRole('header', { name: 'One more check-in to compare' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add photos' }));
    expect(mockPush).toHaveBeenCalledWith('/check-in');
  });

  it('compare two dates: the changes between them, signed', async () => {
    mockData.photos = [photo('2026-10-10', 'front'), photo('2026-09-01', 'front')];
    mockData.entries = [entry('2026-09-01', 84, 20), entry('2026-10-10', 82, 19)];
    await renderUI(<ComparePhotosScreen />);
    expect(screen.getByText('−2.0')).toBeTruthy();
    expect(screen.getByText('−1.0')).toBeTruthy();
  });
});
