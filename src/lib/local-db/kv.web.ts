import type { Kv } from './engine';

/** IndexedDB: room for the database and the photos (localStorage would run out at ~5 MB). */
const DB_NAME = 'fft-local';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const kv: Kv = {
  async getText(key) {
    const v = await run('readonly', (s) => s.get(`text:${key}`));
    return typeof v === 'string' ? v : null;
  },
  async setText(key, text) {
    await run('readwrite', (s) => s.put(text, `text:${key}`));
  },
  async putFile(key, bytes, mime) {
    await run('readwrite', (s) =>
      s.put(new Blob([bytes as unknown as BlobPart], { type: mime }), `file:${key}`),
    );
  },
  async fileUrl(key) {
    const blob = await run('readonly', (s) => s.get(`file:${key}`));
    return blob instanceof Blob ? URL.createObjectURL(blob) : null;
  },
  async removeFile(key) {
    await run('readwrite', (s) => s.delete(`file:${key}`));
  },
  async clearAll() {
    await run('readwrite', (s) => s.clear());
  },
};
