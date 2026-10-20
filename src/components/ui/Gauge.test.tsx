import { screen } from '@testing-library/react-native';
import { processColor } from 'react-native';
import { renderUI } from '@/test/render';
import { Gauge } from './Gauge';

const segments = [
  { share: 0.3, color: '#E0457B' },
  { share: 0.5, color: '#E8B400' },
  { share: 0.2, color: '#3BA3E0' },
];

describe('Gauge', () => {
  it('a split fill has round ends in its first and last colour (no grey at the ends)', async () => {
    await renderUI(
      <Gauge
        value={0.6}
        size={160}
        stroke={14}
        sweep={0.75}
        segments={segments}
        accessibilityLabel="x"
      />,
    );
    const start = screen.getByTestId('gauge-cap-0', { includeHiddenElements: true });
    const end = screen.getByTestId('gauge-cap-1', { includeHiddenElements: true });
    expect(start.props.stroke.payload).toBe(processColor('#E0457B'));
    expect(start.props.strokeLinecap).toBe(1); // round
    expect(end.props.stroke.payload).toBe(processColor('#3BA3E0'));
  });

  it('nothing eaten: no end caps over the empty track', async () => {
    await renderUI(
      <Gauge
        value={0}
        size={160}
        stroke={14}
        sweep={0.75}
        segments={segments}
        accessibilityLabel="x"
      />,
    );
    expect(screen.queryByTestId('gauge-cap-0', { includeHiddenElements: true })).toBeNull();
  });
});
