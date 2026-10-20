import '@/i18n';
import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { profilePalette } from '@/design/profile-palette';
import { renderUI } from '@/test/render';
import { LookLine, MemberAvatar } from './MemberAvatar';

const PID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const hidden = { includeHiddenElements: true };
/** expo-image passes its source on as a list. */
const sourceOf = (el: { props: Record<string, unknown> }) =>
  ([] as { uri: string }[]).concat(el.props.source as { uri: string })[0]?.uri;

beforeAll(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://api.example.test/';
});

describe('MemberAvatar (DECISIONS 119)', () => {
  it('without a look: the initial on the neutral disc, no frame, no photo', async () => {
    await renderUI(<MemberAvatar name="sara" />);
    expect(screen.getByText('S', hidden)).toBeTruthy();
    expect(screen.queryByTestId('member-avatar-photo', hidden)).toBeNull();
    expect(screen.queryByTestId('member-avatar-frame-solid', hidden)).toBeNull();
  });

  it('the old ring (you, first place) is a solid frame', async () => {
    await renderUI(<MemberAvatar name="Sara" ring />);
    expect(screen.getByTestId('member-avatar-frame-solid', hidden)).toBeTruthy();
  });

  it('colour and frame: the initial in the colour ink on its disc, the chosen frame', async () => {
    await renderUI(<MemberAvatar name="Sara" look={{ colour: 'ocean', frame: 'dashed' }} />);
    expect(screen.getByTestId('member-avatar-frame-dashed', hidden)).toBeTruthy();
    const initial = screen.getByText('S', hidden);
    expect(StyleSheet.flatten(initial.props.style).color).toBe(profilePalette.light.ocean.ink);
  });

  it('a photo is loaded from the public bucket, in place of the initial', async () => {
    await renderUI(
      <MemberAvatar name="Sara" look={{ photo: `${PID}/abcdef12.jpg`, frame: 'double' }} />,
    );
    expect(sourceOf(screen.getByTestId('member-avatar-photo', hidden))).toBe(
      `https://api.example.test/storage/v1/object/public/community-avatars/${PID}/abcdef12.jpg`,
    );
    expect(screen.queryByText('S', hidden)).toBeNull();
    expect(screen.getByTestId('member-avatar-frame-double', hidden)).toBeTruthy();
  });

  it('a local preview wins over the stored photo', async () => {
    await renderUI(
      <MemberAvatar
        name="Sara"
        look={{ photo: `${PID}/abcdef12.jpg` }}
        photoUri="file:///new.jpg"
      />,
    );
    expect(sourceOf(screen.getByTestId('member-avatar-photo', hidden))).toBe('file:///new.jpg');
  });
});

describe('LookLine', () => {
  it('reads the title and the showcase badge in words', async () => {
    await renderUI(<LookLine look={{ title: 'runner', badge: 'first_workout' }} />);
    expect(screen.getByText('Runner')).toBeTruthy();
    expect(screen.getByLabelText('Runner, badge First workout')).toBeTruthy();
  });

  it('shows nothing without a title or badge', async () => {
    await renderUI(<LookLine look={{ colour: 'rose' }} />);
    expect(screen.queryByText('Runner')).toBeNull();
  });
});
