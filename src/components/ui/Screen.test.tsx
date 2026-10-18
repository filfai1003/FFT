import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { palettes } from '@/design/tokens';
import { renderUI } from '@/test/render';
import { Screen } from './Screen';
import { Text } from './Text';

const statusBar = () => screen.queryByTestId('screen-status-bar', { includeHiddenElements: true });

describe('Screen: the status bar area', () => {
  it('a scrolling page keeps a solid band under the status bar (content never shows there)', async () => {
    await renderUI(
      <Screen scroll>
        <Text>{'x'}</Text>
      </Screen>,
    );
    const band = StyleSheet.flatten(statusBar()!.props.style);
    expect(band).toMatchObject({ position: 'absolute', top: 0, height: 59 });
    expect(band.backgroundColor).toBe(palettes.light.bg);
  });

  it('not when a native header already covers the top', async () => {
    await renderUI(
      <Screen scroll noTopInset>
        <Text>{'x'}</Text>
      </Screen>,
    );
    expect(statusBar()).toBeNull();
  });
});
