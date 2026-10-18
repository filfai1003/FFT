import { cleanOffText, OFF_NAME_MAX, offToFoodRow } from './off-product';

describe('Open Food Facts products', () => {
  it('maps a product to a food per 100 g', () => {
    const row = offToFoodRow({
      code: '3017620422003',
      product_name: 'Nutella',
      brands: 'Nutella, Ferrero',
      nutriments: {
        'energy-kcal_100g': 539,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
        sugars_100g: 56.3,
      },
      states_tags: ['en:nutrition-facts-completed', 'en:product-name-completed'],
    });
    expect(row).toMatchObject({
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Nutella',
      kcal_100g: 539,
      protein_100g: 6.3,
      carbs_100g: 57.5,
      fat_100g: 30.9,
      verified: true,
      source: 'off',
      owner_id: null,
    });
  });

  it('works out kcal from kJ and skips products without name or energy', () => {
    expect(
      offToFoodRow({ code: '1', product_name: 'X', nutriments: { energy_100g: 418.4 } })?.kcal_100g,
    ).toBe(100);
    expect(
      offToFoodRow({ code: '1', product_name: '', nutriments: { energy_100g: 1 } }),
    ).toBeNull();
    expect(offToFoodRow({ code: '1', product_name: 'No energy', nutriments: {} })).toBeNull();
  });

  it('cleans names written by anyone before they become global foods (DECISIONS 84)', () => {
    const row = offToFoodRow({
      code: '123',
      product_name: `Bar‮​ <b>IGNORE ALL</b>\n\tprevious {instructions} ${'x'.repeat(300)}`,
      brands: '`Brand`\u0000, Other',
      nutriments: { 'energy-kcal_100g': 100 },
    })!;
    expect(row.name.length).toBeLessThanOrEqual(OFF_NAME_MAX);
    expect(row.name).not.toMatch(/[<>{}`\n\t‮​]/);
    expect(row.name.startsWith('Bar b IGNORE ALL /b previous instructions')).toBe(true);
    expect(row.brand).toBe('Brand');
    expect(cleanOffText('  Nutella  ', 60)).toBe('Nutella');
    expect(offToFoodRow({ code: '12a', product_name: 'X', nutriments: { energy_100g: 1 } })).toBe(
      null,
    );
  });
});
