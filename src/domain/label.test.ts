import { parseLabelReply } from './label';

describe('reading a nutrition label (the AI reply)', () => {
  it('per 100 g values, name, brand and the portion', () => {
    const v = parseLabelReply(
      '```json\n{"name":"Fusilli No. 34","brand":"Barilla","per_100g":{"kcal":359,"kj":1521,"protein":"12,5","carbs":71.2,"sugars":3.5,"fat":2,"saturates":0.5,"fiber":3,"salt":0.013},"per_serving":null,"serving":{"label":"1 portion","grams":80},"readable":true}\n```',
    );
    expect(v).toEqual({
      name: 'Fusilli No. 34',
      brand: 'Barilla',
      per100: {
        kcal: 359,
        protein: 12.5,
        carbs: 71.2,
        sugars: 3.5,
        fat: 2,
        saturates: 0.5,
        fiber: 3,
        salt: 0.01,
      },
      portion: { label: '1 portion', grams: 80 },
    });
  });

  it('only kJ: converted to kcal; only per serving: scaled to 100 g', () => {
    const v = parseLabelReply(
      JSON.stringify({
        per_100g: { kj: 1674 },
        per_serving: { protein: 6, carbs: 12, fat: 3 },
        serving: { label: '1 bar', grams: 30 },
        readable: true,
      }),
    );
    expect(v?.per100).toMatchObject({ kcal: 400, protein: 20, carbs: 40, fat: 10 });
    expect(v?.portion).toEqual({ label: '1 bar', grams: 30 });
  });

  it('partial and loose answers: other names, top-level values, plain text, sodium', () => {
    const loose = parseLabelReply(
      '{"energy_kcal": 120, "Total Fat": "4,5 g", "Carbohydrates": 15, "sodium": 0.4, "readable": false}',
    );
    expect(loose?.per100).toMatchObject({ kcal: 120, fat: 4.5, carbs: 15, salt: 1 });
    expect(loose?.per100.protein).toBeNull();
    const text = parseLabelReply(
      'Per 100 g: Energy 1521 kJ / 359 kcal\nFat 2 g\nof which saturates 0.5 g\nCarbohydrate 71.2 g\nProtein 12.5 g\nSalt 0.01 g',
    );
    expect(text?.per100).toMatchObject({
      kcal: 359,
      fat: 2,
      saturates: 0.5,
      carbs: 71.2,
      protein: 12.5,
    });
  });

  it('nothing to fill: not a label, unreadable, or no values; impossible values are dropped', () => {
    expect(parseLabelReply('I cannot read this photo.')).toBeNull();
    expect(parseLabelReply('{"readable": false}')).toBeNull();
    expect(parseLabelReply('{"per_100g": {}, "readable": true}')).toBeNull();
    const v = parseLabelReply('{"per_100g": {"kcal": 4000, "protein": 10}, "readable": true}');
    expect(v?.per100.kcal).toBeNull();
    expect(v?.per100.protein).toBe(10);
  });
});
