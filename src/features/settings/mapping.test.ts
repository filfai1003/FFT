import type { Row } from '@/types/db';
import { defaultAppearance, defaultPreferences, rowToState, stateToRow } from './mapping';

const row = (patch: Partial<Row<'user_settings'>> = {}) =>
  ({
    user_id: 'u1',
    ...stateToRow(defaultAppearance, defaultPreferences),
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...patch,
  }) as Row<'user_settings'>;

describe('user_settings mapping: area colours (DECISIONS 118)', () => {
  it('saves and reads back the chosen area colours', () => {
    const saved = stateToRow(
      { ...defaultAppearance, areaColors: { training: 'blue', streak: 'pink' } },
      defaultPreferences,
    );
    expect(saved.area_colors).toEqual({ training: 'blue', streak: 'pink' });
    expect(rowToState(row({ area_colors: saved.area_colors! })).appearance.areaColors).toEqual({
      training: 'blue',
      streak: 'pink',
    });
  });

  it('a row from before 118 (no column) or with unknown values reads as the default look', () => {
    const old = row();
    delete (old as Partial<typeof old>).area_colors;
    expect(rowToState(old).appearance.areaColors).toEqual({});
    expect(
      rowToState(row({ area_colors: { training: 'green', nutrition: 'pink' } })).appearance
        .areaColors,
    ).toEqual({});
  });
});
