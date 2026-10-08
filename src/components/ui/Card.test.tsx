import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { renderUI } from '@/test/render';
import { Card } from './Card';
import { Screen } from './Screen';

describe('Card', () => {
  it('renders children', async () => {
    await renderUI(
      <Card>
        <Text>inside</Text>
      </Card>,
    );
    expect(screen.getByText('inside')).toBeTruthy();
  });

  it('is a button of at least 52px when pressable', async () => {
    const onPress = jest.fn();
    await renderUI(
      <Card onPress={onPress} accessibilityLabel="open plan">
        <Text>plan</Text>
      </Card>,
    );
    const button = screen.getByRole('button', { name: 'open plan' });
    expect(JSON.stringify(button.props.style)).toContain('"minHeight":52');
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Screen', () => {
  it('renders children over the dot grid', async () => {
    await renderUI(
      <Screen>
        <Text>content</Text>
      </Screen>,
    );
    expect(screen.getByText('content')).toBeTruthy();
  });
});
