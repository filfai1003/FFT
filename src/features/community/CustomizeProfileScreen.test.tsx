import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { usePlanStore } from '@/lib/plan';
import { useToastStore } from '@/lib/toast-store';
import { renderUI } from '@/test/render';
import { CustomizeProfileScreen } from './CustomizeProfileScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}));

const PID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const mockState: { member: boolean; photo: string | null } = { member: true, photo: null };
const mockSave = jest.fn(async (_c: unknown) => ({}));
const mockSetPhoto = jest.fn(async (_a: { localUri?: string | null; path?: string | null }) =>
  _a.localUri ? `${PID}/new12345.jpg` : (_a.path ?? null),
);
jest.mock('./api', () => ({
  useCommunityAvailable: () => true,
  useCommunityMe: () => ({
    isPending: false,
    data: mockState.member
      ? {
          public_id: PID,
          name: 'Filippo',
          invite_code: 'ABCD2345',
          level: 7,
          badges: ['first_workout', 'streak_7'],
          joined_at: '2026-09-02T10:00:00Z',
          submitted_at: null,
          profile_colour: null,
          frame: null,
          title: null,
          showcase_badge: null,
          photo_path: mockState.photo,
          look: mockState.photo ? { photo: mockState.photo } : null,
        }
      : null,
  }),
  useSetCosmetics: () => ({ mutateAsync: mockSave, isPending: false }),
  useSetAvatar: () => ({ mutateAsync: mockSetPhoto, isPending: false }),
}));
const mockPick = jest.fn(async (_s: string): Promise<string | null> => 'file:///picked.jpg');
jest.mock('./avatar-photo', () => ({
  avatarUrl: (p: string | null | undefined) => (p ? `https://x.test/${p}` : null),
  pickAvatar: (s: string) => mockPick(s),
  removeAvatarFile: jest.fn(async () => undefined),
}));

beforeEach(() => {
  mockPush.mockClear();
  mockSave.mockClear();
  mockSetPhoto.mockClear();
  mockPick.mockClear();
  mockState.member = true;
  mockState.photo = null;
  useToastStore.setState({ toast: null });
  // Old photo files wait for the toast (5 s) before they are deleted.
  jest.useFakeTimers();
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('Customize profile (DECISIONS 119)', () => {
  it('free: the page with the Supporter tag; every choice opens the Plans page; no Save', async () => {
    usePlanStore.setState({ plan: 'free' });
    await renderUI(<CustomizeProfileScreen />);
    expect(screen.getByText('Comes with Supporter')).toBeTruthy();
    expect(screen.getAllByText('Supporter').length).toBeGreaterThan(1);
    // Where the photo is chosen, it says who sees it.
    expect(screen.getByText(/public to every community member/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Ocean'));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/premium');
    await fireEvent.press(screen.getByLabelText('Choose from gallery'));
    expect(mockPick).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('supporter: colour, frame, badge and title, then Save (with undo)', async () => {
    usePlanStore.setState({ plan: 'supporter' });
    await renderUI(<CustomizeProfileScreen />);
    expect(screen.queryByText('Comes with Supporter')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Ocean'));
    expect(screen.getByLabelText('Ocean').props.accessibilityState).toMatchObject({
      checked: true,
    });
    await fireEvent.press(screen.getByLabelText('Double'));
    await fireEvent.press(screen.getByLabelText('First workout'));
    await fireEvent.press(screen.getByLabelText('Runner'));
    // Only earned badges are offered.
    expect(screen.queryByLabelText('A whole year')).toBeNull();
    await fireEvent.press(screen.getByText('Save'));
    expect(mockSave).toHaveBeenCalledWith({
      colour: 'ocean',
      frame: 'double',
      title: 'runner',
      badge: 'first_workout',
    });
    expect(useToastStore.getState().toast?.message).toBe('Profile look saved');
    useToastStore.getState().toast?.onAction?.();
    expect(mockSave).toHaveBeenLastCalledWith({
      colour: null,
      frame: null,
      title: null,
      badge: null,
    });
  });

  it('supporter: a photo from the gallery is uploaded; Undo puts the old one back', async () => {
    usePlanStore.setState({ plan: 'premium' });
    mockState.photo = `${PID}/old12345.jpg`;
    await renderUI(<CustomizeProfileScreen />);
    await fireEvent.press(screen.getByLabelText('Choose from gallery'));
    expect(mockPick).toHaveBeenCalledWith('library');
    expect(mockSetPhoto).toHaveBeenCalledWith({ publicId: PID, localUri: 'file:///picked.jpg' });
    expect(useToastStore.getState().toast?.message).toBe('Photo updated');
    useToastStore.getState().toast?.onAction?.();
    expect(mockSetPhoto).toHaveBeenLastCalledWith({ publicId: PID, path: `${PID}/old12345.jpg` });
  });

  it('remove photo: none set, with undo', async () => {
    usePlanStore.setState({ plan: 'supporter' });
    mockState.photo = `${PID}/old12345.jpg`;
    await renderUI(<CustomizeProfileScreen />);
    await fireEvent.press(screen.getByLabelText('Remove photo'));
    expect(mockSetPhoto).toHaveBeenCalledWith({ publicId: PID, path: null });
    expect(useToastStore.getState().toast?.message).toBe('Photo removed');
  });

  it('not a member: says to join first', async () => {
    usePlanStore.setState({ plan: 'supporter' });
    mockState.member = false;
    await renderUI(<CustomizeProfileScreen />);
    expect(screen.getByText('Join the community first')).toBeTruthy();
    await fireEvent.press(screen.getByText('Go to the community'));
    expect(mockPush).toHaveBeenCalledWith('/progress');
  });
});
