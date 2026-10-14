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
    if (f.exists) return await f.text();
    // Stopped between the two steps of setText: the new copy is complete in the .tmp file.
    const tmp = fileFor(`${key}.tmp`, 'text');
    return tmp.exists ? await tmp.text() : null;
  },
  /**
   * Never half-written: the text goes to a .tmp file first, which then takes the place of the
   * old one; the old one stays as `<key>.bak` (read when the main copy is unreadable). The app can
   * be killed or restarted (an update) at any moment without losing the database.
   */
  async setText(key, text) {
    const f = fileFor(key, 'text');
    const tmp = fileFor(`${key}.tmp`, 'text');
    const bak = fileFor(`${key}.bak`, 'text');
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(text);
    if (f.exists) {
      if (bak.exists) bak.delete();
      f.move(bak);
    }
    tmp.move(fileFor(key, 'text'));
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
