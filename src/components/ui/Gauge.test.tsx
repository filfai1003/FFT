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

  it('very little filled: one round piece in the first colour, not two overlapping dots', async () => {
    // 91 of 2,000 kcal on a 160 pt gauge.
    await renderUI(
      <Gauge
        value={91 / 2000}
        size={160}
        stroke={14}
        sweep={0.75}
        segments={segments}
        accessibilityLabel="x"
      />,
    );
    const only = screen.getByTestId('gauge-cap-0', { includeHiddenElements: true });
    expect(only.props.stroke.payload).toBe(processColor('#E0457B'));
    expect(screen.queryByTestId('gauge-cap-1', { includeHiddenElements: true })).toBeNull();
  });

  it('a ring nearly full has square ends (no dent where the round ends would overlap)', async () => {
    await renderUI(<Gauge value={0.98} size={64} stroke={6} accessibilityLabel="x" />);
    expect(
      screen.getByTestId('gauge-fill', { includeHiddenElements: true }).props.strokeLinecap,
    ).toBe(0); // butt
  });

  it('a ring well short of full keeps round ends; a gauge always does', async () => {
    await renderUI(<Gauge value={0.5} size={64} stroke={6} accessibilityLabel="x" />);
    expect(
      screen.getByTestId('gauge-fill', { includeHiddenElements: true }).props.strokeLinecap,
    ).toBe(1);
    await renderUI(<Gauge value={1} size={64} stroke={6} sweep={0.75} accessibilityLabel="y" />);
    expect(
      screen.getByTestId('gauge-fill', { includeHiddenElements: true }).props.strokeLinecap,
    ).toBe(1);
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
