import { Directory, File, Paths } from 'expo-file-system';
import type { Kv } from './engine';

/** On iOS / Android: plain files in the app's private documents folder. */
const folder = () => new Directory(Paths.document, 'fft-local');

function fileFor(key: string, kind: 'text' | 'file') {
  folder().create({ idempotent: true, intermediates: true });
  return new File(folder(), `${kind}-${encodeURIComponent(key)}`);
}

export const kv: Kv = {
  async getText(key) {
    const f = fileFor(key, 'text');
    return f.exists ? await f.text() : null;
  },
  async setText(key, text) {
    const f = fileFor(key, 'text');
    if (!f.exists) f.create();
    f.write(text);
  },
  async putFile(key, bytes) {
    const f = fileFor(key, 'file');
    if (!f.exists) f.create();
    f.write(bytes);
  },
  async fileUrl(key) {
    const f = fileFor(key, 'file');
    return f.exists ? f.uri : null;
  },
  async removeFile(key) {
    const f = fileFor(key, 'file');
    if (f.exists) f.delete();
  },
  async clearAll() {
    const d = folder();
    if (d.exists) d.delete();
  },
};
