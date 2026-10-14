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

  it('nothing to fill: not a label, unreadable, or no values; impossible values are dropped', () => {
    expect(parseLabelReply('I cannot read this photo.')).toBeNull();
    expect(parseLabelReply('{"readable": false}')).toBeNull();
    expect(parseLabelReply('{"per_100g": {}, "readable": true}')).toBeNull();
    const v = parseLabelReply('{"per_100g": {"kcal": 4000, "protein": 10}, "readable": true}');
    expect(v?.per100.kcal).toBeNull();
    expect(v?.per100.protein).toBe(10);
  });
});
