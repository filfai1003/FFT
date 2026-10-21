import fs from 'node:fs';
import path from 'node:path';
import { screen } from '@testing-library/react-native';
import { palettes } from '@/design/tokens';
import { renderUI } from '@/test/render';
import { ExerciseImage } from './ExerciseImage';

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('ExerciseImage', () => {
  it('without an image: dashed tile, radius 28% of the size', async () => {
    await renderUI(<ExerciseImage size={52} />);
    const tile = screen.getByTestId('exercise-image', { includeHiddenElements: true });
    const style = flat(tile.props.style);
    expect(style.borderStyle).toBe('dashed');
    expect(style.borderRadius).toBe(15); // round(52 * 0.28)
    expect(style.width).toBe(52);
  });

  it('with an image: solid border', async () => {
    await renderUI(<ExerciseImage uri="https://example.com/bench-press.png" size={40} />);
    const style = flat(
      screen.getByTestId('exercise-image', { includeHiddenElements: true }).props.style,
    );
    expect(style.borderStyle).toBe('solid');
    expect(style.borderRadius).toBe(11);
  });

  it('with an image: the neutral tile of the theme behind it (no black square)', async () => {
    await renderUI(<ExerciseImage uri="https://example.com/bench-press.png" size={40} />);
    const style = flat(
      screen.getByTestId('exercise-image', { includeHiddenElements: true }).props.style,
    );
    expect(style.backgroundColor).toBe(palettes.light.surfaceAlt);
  });

  it('the bundled pictures have a transparent background', () => {
    const dir = path.join(__dirname, '../../../assets/exercise-images');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.png'))) {
      // PNG header: the colour type (byte 25) is 4 (grey + alpha) or 6 (RGBA) with transparency.
      const colourType = fs.readFileSync(path.join(dir, f))[25];
      expect([f, colourType === 4 || colourType === 6]).toEqual([f, true]);
    }
  });
});
