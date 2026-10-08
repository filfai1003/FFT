import { newId, stableId } from './uuid';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;

describe('ids', () => {
  it('newId returns UUIDs', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(newId()).not.toBe(newId());
  });

  it('stableId is deterministic, UUID-shaped and depends on user and purpose', async () => {
    const a = await stableId('user-1', 'first-goal');
    expect(a).toMatch(UUID);
    expect(await stableId('user-1', 'first-goal')).toBe(a);
    expect(await stableId('user-2', 'first-goal')).not.toBe(a);
    expect(await stableId('user-1', 'first-weight')).not.toBe(a);
  });
});
