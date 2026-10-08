import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { DotBar } from './DotBar';
import { DotColumnChart } from './DotColumnChart';

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('DotBar', () => {
  it('exposes progress to screen readers', async () => {
    await renderUI(<DotBar total={40} on={17} accessibilityLabel="Calories" />);
    const bar = screen.getByRole('progressbar', { name: 'Calories' });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 40, now: 17 });
    expect(bar.children).toHaveLength(40);
  });

  it('lights exactly `on` dots, in order', async () => {
    await renderUI(<DotBar total={10} on={6} accessibilityLabel="Protein" />);
    const dots = screen.getByRole('progressbar').children as unknown as {
      props: { style: unknown };
    }[];
    const colors = dots.map((d) => flat(d.props.style).backgroundColor);
    expect(colors.filter((c) => c === '#F2F2F2')).toHaveLength(6);
    expect(colors.slice(0, 6).every((c) => c === '#F2F2F2')).toBe(true);
  });

  it('clamps out-of-range values', async () => {
    await renderUI(<DotBar total={8} on={99} accessibilityLabel="Water" />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(8);
  });
});

describe('DotColumnChart', () => {
  it('renders one column per value with the given rows and a text alternative', async () => {
    await renderUI(
      <DotColumnChart values={[1, 2, 3]} rows={8} accessibilityLabel="Strength over 3 weeks" />,
    );
    const chart = screen.getByRole('image', { name: 'Strength over 3 weeks' });
    expect(chart.children).toHaveLength(3);
    const column = chart.children[0] as unknown as { children: unknown[] };
    expect(column.children).toHaveLength(8);
  });
});
