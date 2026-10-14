import { offToFoodRow } from './off-product';

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
});
