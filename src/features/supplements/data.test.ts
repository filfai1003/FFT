import { createLocalClient } from '@/lib/local-db/client';
import { LocalDb, type Kv } from '@/lib/local-db/engine';
import { LOCAL_USER_ID } from '@/lib/local-db/schema';
import { supplementDay, type Supplement } from './data';

function memoryKv(): Kv {
  const texts = new Map<string, string>();
  return {
    getText: async (k) => texts.get(k) ?? null,
    setText: async (k, v) => void texts.set(k, v),
    putFile: async () => undefined,
    fileUrl: async () => null,
    readFile: async () => null,
    removeFile: async () => undefined,
    clearAll: async () => texts.clear(),
  };
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const list: Supplement[] = [
  { id: id(1), name: 'Creatine', dose: '5 g', position: 0 },
  { id: id(2), name: 'Vitamin D', dose: null, position: 1 },
];

describe('supplements', () => {
  it('a day is all, some or none of the current list', () => {
    expect(supplementDay(new Set([id(1), id(2)]), list)).toBe('all');
    expect(supplementDay(new Set([id(1)]), list)).toBe('some');
    expect(supplementDay(new Set([id(9)]), list)).toBe('none');
    expect(supplementDay(undefined, list)).toBe('none');
    expect(supplementDay(new Set([id(1)]), [])).toBe('none');
  });

  it('one tick per supplement and day; unticked then ticked again works', async () => {
    const c = createLocalClient(new LocalDb(memoryKv(), LOCAL_USER_ID));
    await c.from('supplements').insert({ id: id(1), name: 'Creatine', dose: '5 g' });
    const tick = (n: number) =>
      c.from('supplement_logs').insert({ id: id(n), day: '2026-10-14', supplement_id: id(1) });
    expect((await tick(10)).error).toBeNull();
    expect((await tick(11)).error?.code).toBe('23505');
    await c.from('supplement_logs').update({ deleted_at: '2026-10-14T10:00:00Z' }).eq('id', id(10));
    expect((await tick(12)).error).toBeNull();
  });
});
