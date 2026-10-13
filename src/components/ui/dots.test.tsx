import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { DotBar } from './DotBar';
import { DotColumnChart } from './DotColumnChart';

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

type Node = { props: { style: unknown }; children: unknown[] };

describe('DotBar', () => {
  it('exposes progress to screen readers', async () => {
    await renderUI(<DotBar total={40} on={17} accessibilityLabel="Calories" />);
    const bar = screen.getByRole('progressbar', { name: 'Calories' });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 40, now: 17 });
  });

  it('fills the bar in proportion, from the left', async () => {
    await renderUI(<DotBar total={10} on={6} accessibilityLabel="Protein" />);
    const track = screen.getByRole('progressbar').children[0] as unknown as Node;
    const fill = track.children[0] as unknown as Node;
    expect(flat(fill.props.style).width).toBe('60%');
  });

  it('segments: lights exactly `on` steps, in order', async () => {
    await renderUI(<DotBar shape="segment" total={6} on={2} accessibilityLabel="Exercises" />);
    const steps = screen.getByRole('progressbar').children as unknown as Node[];
    expect(steps).toHaveLength(6);
    const colors = steps.map((d) => flat(d.props.style).backgroundColor);
    expect(colors[0]).toBe(colors[1]);
    expect(colors[1]).not.toBe(colors[2]);
  });

  it('clamps out-of-range values', async () => {
    await renderUI(<DotBar total={8} on={99} accessibilityLabel="Water" />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(8);
  });
});

describe('DotColumnChart', () => {
  it('renders one column per value and a text alternative', async () => {
    await renderUI(
      <DotColumnChart values={[1, 2, 3]} rows={8} accessibilityLabel="Strength over 3 weeks" />,
    );
    const chart = screen.getByRole('image', { name: 'Strength over 3 weeks' });
    expect(chart.children).toHaveLength(3);
  });
});
